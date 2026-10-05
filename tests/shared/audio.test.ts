import { describe, expect, it } from 'vitest';
import type { AudioAssetMeta } from '../../shared/asset';
import { describeAssetRecipe } from '../../shared/asset-recipe';
import { estimateAudioSize } from '../../shared/asset-size-estimate';
import {
  AUDIO_MIN_BITRATE,
  audioTargetBitrate,
} from '../../shared/asset-upload-quality';
import {
  buildAssetSettingsKey,
  resolveAssetUploadSettings,
  type AssetAudioTransformSettings,
} from '../../shared/asset-upload-settings';
import { canZipAssetExtension } from '../../shared/asset-upload-zip';
import {
  getAssetMediaKind,
  getAssetMimeType,
  isAssetExtensionSafeInline,
} from '../../shared/assets/formats';
import {
  audioDescriptorFromMeta,
  formatMediaTime,
  isLosslessAudioCodec,
  normalizeAudioDescriptor,
  poolAudioPeaks,
} from '../../shared/audio';
import en from '../../shared/language/list/en';

describe('audio formats', () => {
  it.each(['m4a', 'AAC', 'opus', 'oga', 'weba', 'aif', 'aiff', 'mp3'])(
    'files %s as sound',
    (extension) => {
      expect(getAssetMediaKind(extension)).toBe('audio');
      expect(isAssetExtensionSafeInline(extension)).toBe(true);
      expect(canZipAssetExtension(extension)).toBe(false);
    },
  );

  it('serves a stored recording as WebM audio', () => {
    expect(getAssetMimeType('weba')).toBe('audio/webm');
    expect(getAssetMimeType('m4a')).toBe('audio/mp4');
    // A video stays a video.
    expect(getAssetMediaKind('webm')).toBe('video');
  });
});

describe('audio settings', () => {
  it('keys a recording by its quality and channels alone', () => {
    const settings = resolveAssetUploadSettings(
      { type: 'audio-transform', quality: 75, mono: true },
      { channels: 2 },
    );
    expect(settings).toEqual({
      type: 'audio-transform',
      quality: 75,
      mono: true,
    });
    expect(buildAssetSettingsKey(settings)).toBe('audio-transform:q75:mono:1');
  });

  it('describes a mono source as mono however it is asked for', () => {
    const asked = resolveAssetUploadSettings(
      { type: 'audio-transform', quality: 75, mono: false },
      { channels: 1 },
    );
    const mono = resolveAssetUploadSettings(
      { type: 'audio-transform', quality: 75, mono: true },
      { channels: 1 },
    );
    expect(buildAssetSettingsKey(asked)).toBe(buildAssetSettingsKey(mono));
  });

  it('needs no frame', () => {
    expect(() =>
      resolveAssetUploadSettings({
        type: 'audio-transform',
        quality: 40,
        mono: false,
      }),
    ).not.toThrow();
  });
});

describe('audio bitrate', () => {
  it('spends 96 kbit/s on stereo and 48 on mono at medium', () => {
    expect(audioTargetBitrate(75, false)).toBe(96_000);
    expect(audioTargetBitrate(75, true)).toBe(48_000);
    expect(audioTargetBitrate(40, false)).toBe(48_000);
    expect(audioTargetBitrate(95, false)).toBe(160_000);
    expect(audioTargetBitrate(95, true)).toBe(80_000);
  });

  it('never asks for more than a lossy source had', () => {
    expect(
      audioTargetBitrate(95, false, { bitrate: 64_000, codec: 'mp3' }),
    ).toBe(64_000);
    expect(
      audioTargetBitrate(75, false, { bitrate: 128_000, codec: 'aac' }),
    ).toBe(96_000);
  });

  it('takes no ceiling from a lossless source', () => {
    expect(
      audioTargetBitrate(75, false, { bitrate: 40_000, codec: 'pcm_s16le' }),
    ).toBe(96_000);
    expect(
      audioTargetBitrate(75, false, { bitrate: 40_000, codec: 'flac' }),
    ).toBe(96_000);
  });

  it('keeps a floor for a starved source', () => {
    expect(
      audioTargetBitrate(75, true, { bitrate: 6_000, codec: 'amr_nb' }),
    ).toBe(AUDIO_MIN_BITRATE);
  });

  it('knows the lossless codecs by their ffmpeg names', () => {
    expect(isLosslessAudioCodec('pcm_f32le')).toBe(true);
    expect(isLosslessAudioCodec('alac')).toBe(true);
    expect(isLosslessAudioCodec('opus')).toBe(false);
    expect(isLosslessAudioCodec(undefined)).toBe(false);
  });
});

describe('audio size estimate', () => {
  const settings: AssetAudioTransformSettings = {
    type: 'audio-transform',
    quality: 75,
    mono: false,
  };

  it('is the bitrate times the length, and the container', () => {
    const estimate = estimateAudioSize(settings, { duration: 60 });
    expect(estimate?.bitrate).toBe(96_000);
    // A minute of medium stereo: about 0.7 MB.
    expect(estimate?.bytes).toBe(((96_000 + 3_000) * 60) / 8 + 1024);
  });

  it('halves for mono, and says nothing without a length', () => {
    const stereo = estimateAudioSize(settings, { duration: 600 })!.bytes;
    const mono = estimateAudioSize(
      { ...settings, mono: true },
      { duration: 600 },
    )!.bytes;
    expect(mono / stereo).toBeGreaterThan(0.5);
    expect(mono / stereo).toBeLessThan(0.55);
    expect(estimateAudioSize(settings, {})).toBeUndefined();
  });
});

describe('audio recipe', () => {
  it('names the codec, the rate the file came out at and the level', () => {
    const meta: AudioAssetMeta = {
      duration: 10,
      peaks: [],
      bitrate: 47_400,
      channels: 1,
    };
    expect(
      describeAssetRecipe(
        { type: 'audio-transform', quality: 75, mono: true },
        meta,
        en.phrases,
      ),
    ).toBe('Opus · 47 kbit/s · medium quality · mono');
  });
});

describe('audio descriptor', () => {
  it('reads what a player needs from a recording', () => {
    expect(
      audioDescriptorFromMeta({
        duration: 3.5,
        peaks: [0, 50, 100],
        channels: 2,
        bitrate: 96_000,
      }),
    ).toEqual({ duration: 3.5, peaks: [0, 50, 100], channels: 2 });
    expect(audioDescriptorFromMeta({ width: 10, height: 10 })).toBeUndefined();
    expect(audioDescriptorFromMeta(null)).toBeUndefined();
  });

  it('drops anything that is not a waveform', () => {
    expect(
      normalizeAudioDescriptor({ duration: 1, peaks: [101] }),
    ).toBeUndefined();
    expect(
      normalizeAudioDescriptor({ duration: 1, peaks: [1.5] }),
    ).toBeUndefined();
    expect(
      normalizeAudioDescriptor({ duration: -1, peaks: [] }),
    ).toBeUndefined();
    expect(normalizeAudioDescriptor({ peaks: [] })).toBeUndefined();
    expect(
      normalizeAudioDescriptor({ duration: 0, peaks: [], channels: 0 }),
    ).toEqual({ duration: 0, peaks: [] });
  });

  it('pools the stored peaks into as many bars as fit', () => {
    expect(poolAudioPeaks([10, 90, 20, 40], 2)).toEqual([90, 40]);
    expect(poolAudioPeaks([10, 90], 4)).toEqual([10, 10, 90, 90]);
    expect(poolAudioPeaks([], 4)).toEqual([]);
  });

  it('writes a time as m:ss, and h:mm:ss from an hour on', () => {
    expect(formatMediaTime(0)).toBe('0:00');
    expect(formatMediaTime(75.9)).toBe('1:15');
    expect(formatMediaTime(3600 + 62)).toBe('1:01:02');
    expect(formatMediaTime(Number.NaN)).toBe('0:00');
  });
});
