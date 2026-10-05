import { describe, expect, it } from 'vitest';
import { AssetType } from '../../shared/asset';
import { pastedMediaRequest } from '../../shared/asset-paste-defaults';
import {
  buildAssetSettingsKey,
  resolveAssetUploadSettings,
} from '../../shared/asset-upload-settings';

describe('pastedMediaRequest', () => {
  it('encodes a pasted picture at medium, whole and at its own size', () => {
    const request = pastedMediaRequest({
      type: AssetType.Image,
      extension: 'PNG',
    });
    expect(request).toEqual({
      type: 'image-transform',
      quality: 75,
      dimensions: {},
    });
    const settings = resolveAssetUploadSettings(request, {
      width: 1600,
      height: 900,
    });
    expect(buildAssetSettingsKey(settings)).toBe(
      'image-transform:q75:w1600:h900:fmt:avif',
    );
  });

  it('asks the editor for the same file, so an interrupted encode is its first dry run', () => {
    const source = { width: 1600, height: 900 };
    const editor = resolveAssetUploadSettings(
      {
        type: 'image-transform',
        quality: 75,
        crop: { left: 0, top: 0, width: 1600, height: 900 },
        dimensions: {},
        format: 'avif',
      },
      source,
    );
    const pasted = resolveAssetUploadSettings(
      pastedMediaRequest({ type: AssetType.Image, extension: 'jpg' }),
      source,
    );
    expect(buildAssetSettingsKey(pasted)).toBe(buildAssetSettingsKey(editor));
  });

  it('encodes a pasted video at medium without touching its frame', () => {
    expect(
      pastedMediaRequest({ type: AssetType.Video, extension: 'mp4' }),
    ).toEqual({
      type: 'video-transform',
      quality: 75,
      dimensions: {},
      stripAudio: false,
      fastConversion: false,
    });
  });

  it.each(['svg', 'GIF'])('keeps a %s as it is', (extension) => {
    expect(pastedMediaRequest({ type: AssetType.Image, extension })).toEqual({
      type: 'original',
    });
  });

  it('converts a pasted recording to Opus at medium, in stereo', () => {
    const request = pastedMediaRequest({
      type: AssetType.Audio,
      extension: 'm4a',
      codec: 'aac',
    });
    expect(request).toEqual({
      type: 'audio-transform',
      quality: 75,
      mono: false,
    });
    expect(buildAssetSettingsKey(resolveAssetUploadSettings(request, {}))).toBe(
      'audio-transform:q75:mono:0',
    );
  });

  it('keeps a recording that is already Opus in a weba as it is', () => {
    expect(
      pastedMediaRequest({
        type: AssetType.Audio,
        extension: 'WEBA',
        codec: 'opus',
      }),
    ).toEqual({ type: 'original' });
    // Opus in Ogg plays on fewer browsers than the WebM it would become.
    expect(
      pastedMediaRequest({
        type: AssetType.Audio,
        extension: 'opus',
        codec: 'opus',
      }).type,
    ).toBe('audio-transform');
  });

  it('keeps anything else as it is', () => {
    expect(
      pastedMediaRequest({ type: AssetType.Other, extension: 'pdf' }),
    ).toEqual({ type: 'original' });
  });
});
