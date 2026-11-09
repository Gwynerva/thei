import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFfmpegTools } from '../../../update/ffmpeg/tools';
import { AssetType } from '../../../shared/asset';
import {
  buildAssetSettingsKey,
  resolveAssetUploadSettings,
  type AssetAudioTransformSettings,
} from '../../../shared/asset-upload-settings';
import { AUDIO_WAVEFORM_PEAKS } from '../../../shared/audio';
import {
  audioMetaFromDetails,
  audioSourceInfo,
  buildAudioEncodeArgs,
  probeAudioSource,
  processAudioToOpus,
  readAudioDetails,
} from '../../../server/thei/assets/audio';
import {
  WAVEFORM_SAMPLE_RATE,
  WaveformAccumulator,
} from '../../../server/thei/assets/audio-waveform';
import { inspectionFromProbe } from '../../../server/thei/assets/probe';
import type { AssetSourceFile } from '../../../server/thei/assets/process';
import { stripAssetMetadata } from '../../../server/thei/assets/strip-metadata';

let directory = '';
const outputs: string[] = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-audio-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(outputs.splice(0).map((path) => rm(path, { force: true })));
});

async function ffmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      resolveFfmpegTools().ffmpeg,
      ['-y', '-loglevel', 'error', ...args],
      { windowsHide: true, stdio: 'ignore' },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

/** A tone of `seconds`, silent for its first half: something to see. */
async function tone(name: string, seconds: number, channels = 2) {
  const path = join(directory, name);
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:sample_rate=44100:duration=${seconds}`,
    '-af',
    `volume='if(lt(t,${seconds / 2}),0,1)':eval=frame`,
    '-ac',
    String(channels),
    '-metadata',
    'title=Secret Title',
    path,
  ]);
  return path;
}

async function source(path: string): Promise<AssetSourceFile> {
  const { size } = await stat(path);
  return { path, size, hash: 'test', extension: 'wav', owned: false };
}

describe('audio probe', () => {
  it('reads a recording without a picture', () => {
    const info = inspectionFromProbe({
      streams: [
        {
          codec_type: 'audio',
          codec_name: 'pcm_s16le',
          sample_rate: '44100',
          channels: 2,
          bit_rate: '1411200',
        },
      ],
      format: { duration: '60.000000', bit_rate: '1411200' },
    });
    expect(info).toMatchObject({
      duration: 60,
      hasAudio: true,
      audioCodec: 'pcm_s16le',
      channels: 2,
      sampleRate: 44_100,
      audioBitrate: 1_411_200,
    });
    expect(info.width).toBeUndefined();
  });

  it('reads a WebM recording, which names no rate per stream', () => {
    const info = inspectionFromProbe({
      streams: [
        {
          codec_type: 'audio',
          codec_name: 'opus',
          sample_rate: '48000',
          channels: 1,
        },
      ],
      format: { duration: '10.010000', bit_rate: '97000' },
    });
    expect(audioSourceInfo(info)).toEqual({
      duration: 10.01,
      bitrate: 97_000,
      codec: 'opus',
      channels: 1,
    });
  });

  it('takes the sound, not the cover picture', () => {
    const info = inspectionFromProbe({
      streams: [
        {
          codec_type: 'audio',
          codec_name: 'mp3',
          sample_rate: '44100',
          channels: 2,
          bit_rate: '128000',
        },
        {
          codec_type: 'video',
          codec_name: 'mjpeg',
          width: 500,
          height: 500,
          disposition: { attached_pic: 1 },
        },
      ],
      format: { duration: '180.000000', bit_rate: '128000' },
    });
    expect(info).toMatchObject({ audioCodec: 'mp3', audioBitrate: 128_000 });
    expect(audioSourceInfo(info).bitrate).toBe(128_000);
  });
});

describe('audio encode arguments', () => {
  const settings = (mono: boolean): AssetAudioTransformSettings => ({
    type: 'audio-transform',
    quality: 75,
    mono,
  });

  it('writes Opus in WebM, with nothing of the source but its first sound', () => {
    const args = buildAudioEncodeArgs('in.wav', 'out.weba', settings(false), {
      codec: 'pcm_s16le',
      bitrate: 1_411_000,
    });
    for (const [flag, value] of [
      ['-i', 'in.wav'],
      ['-map', '0:a:0'],
      ['-map_metadata', '-1'],
      ['-map_chapters', '-1'],
      ['-c:a', 'libopus'],
      ['-b:a', '96000'],
      ['-vbr', 'on'],
      ['-ar', '48000'],
      ['-ac', '2'],
    ])
      expect(args[args.indexOf(flag!) + 1], flag).toBe(value);
    expect(args).toContain('-vn');
    // What follows the input is said of the output.
    expect(args.indexOf('-i')).toBeLessThan(args.indexOf('-map'));
    // ffmpeg does not know `weba`: the muxer is named.
    expect(args.slice(-3)).toEqual(['-f', 'webm', 'out.weba']);
    expect(args).toContain('+bitexact');
  });

  it('folds into one channel, at its own rate', () => {
    const args = buildAudioEncodeArgs('in', 'out', settings(true), {});
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
    expect(args[args.indexOf('-b:a') + 1]).toBe('48000');
  });

  it('spends no more than a lossy source had', () => {
    const args = buildAudioEncodeArgs('in', 'out', settings(false), {
      codec: 'mp3',
      bitrate: 64_000,
    });
    expect(args[args.indexOf('-b:a') + 1]).toBe('64000');
  });
});

describe('waveform accumulator', () => {
  /** 16-bit mono PCM of `samples` at a constant `level`. */
  function pcm(samples: number, level: number) {
    const buffer = Buffer.alloc(samples * 2);
    for (let index = 0; index < samples; index++) {
      buffer.writeInt16LE(index % 2 ? level : -level, index * 2);
    }
    return buffer;
  }

  it('draws a silent half and a loud half', () => {
    const waveform = new WaveformAccumulator();
    waveform.push(pcm(WAVEFORM_SAMPLE_RATE, 0));
    waveform.push(pcm(WAVEFORM_SAMPLE_RATE, 16_000));
    expect(waveform.samples).toBe(2 * WAVEFORM_SAMPLE_RATE);
    const peaks = waveform.finish(4);
    expect(peaks).toEqual([0, 0, 100, 100]);
  });

  it('lifts quiet passages by a square root', () => {
    const waveform = new WaveformAccumulator();
    waveform.push(pcm(800, 4000));
    waveform.push(pcm(800, 16_000));
    expect(waveform.finish(2)).toEqual([50, 100]);
  });

  it('carries a sample split across two chunks', () => {
    const whole = pcm(800, 12_000);
    const split = new WaveformAccumulator();
    split.push(whole.subarray(0, 801));
    split.push(whole.subarray(801));
    const reference = new WaveformAccumulator();
    reference.push(whole);
    expect(split.samples).toBe(800);
    expect(split.finish(8)).toEqual(reference.finish(8));
  });

  it('keeps an hour in the memory of a minute, and the loud moment in it', () => {
    const waveform = new WaveformAccumulator();
    // An hour of silence at 8 kHz, a tenth of a second of sound in its middle.
    const minute = pcm(60 * WAVEFORM_SAMPLE_RATE, 0);
    for (let index = 0; index < 30; index++) waveform.push(minute);
    waveform.push(pcm(WAVEFORM_SAMPLE_RATE / 10, 20_000));
    for (let index = 0; index < 30; index++) waveform.push(minute);
    const peaks = waveform.finish(AUDIO_WAVEFORM_PEAKS);
    expect(peaks).toHaveLength(AUDIO_WAVEFORM_PEAKS);
    expect(peaks.filter((peak) => peak === 100)).toHaveLength(1);
    expect(peaks.indexOf(100)).toBeGreaterThan(55);
    expect(peaks.indexOf(100)).toBeLessThan(72);
  });

  it('stretches a clip shorter than its bars', () => {
    const waveform = new WaveformAccumulator();
    waveform.push(pcm(160, 8000));
    expect(waveform.finish(4)).toEqual([100, 100, 100, 100]);
  });

  it('draws nothing for nothing', () => {
    expect(new WaveformAccumulator().finish()).toEqual([]);
  });
});

describe('audio processing', () => {
  it('encodes a recording into a small WebM of the same length', async () => {
    const wav = await tone('tone.wav', 2);
    const input = await source(wav);
    const settings = resolveAssetUploadSettings(
      { type: 'audio-transform', quality: 75, mono: false },
      await probeAudioSource(input),
    ) as AssetAudioTransformSettings;
    const processed = await processAudioToOpus(input, settings);
    const path = processed.bytes.path!;
    outputs.push(path);
    expect(processed).toMatchObject({
      extension: 'weba',
      type: AssetType.Audio,
    });
    expect(processed.bytes.size!).toBeLessThan(input.size / 8);

    const details = await readAudioDetails(path);
    expect(details.inspection.audioCodec).toBe('opus');
    expect(details.duration).toBeGreaterThan(1.95);
    expect(details.duration).toBeLessThan(2.05);
    expect(details.peaks).toHaveLength(AUDIO_WAVEFORM_PEAKS);
    // Silent, then the tone.
    expect(details.peaks[10]).toBeLessThan(10);
    expect(details.peaks[100]).toBeGreaterThan(90);
    const meta = audioMetaFromDetails(details, processed.bytes.size!);
    expect(meta).toMatchObject({ channels: 2, duration: details.duration });
    expect(meta.bitrate).toBeGreaterThan(0);
  });

  it('makes the same bytes from the same source and recipe', async () => {
    const input = await source(await tone('again.wav', 1));
    const settings: AssetAudioTransformSettings = {
      type: 'audio-transform',
      quality: 40,
      mono: true,
    };
    const first = await processAudioToOpus(input, settings);
    const second = await processAudioToOpus(input, settings);
    outputs.push(first.bytes.path!, second.bytes.path!);
    expect(first.bytes.hash).toBe(second.bytes.hash);
    const details = await readAudioDetails(first.bytes.path!);
    expect(details.inspection.channels).toBe(1);
  });

  it('keys a mono source as mono', async () => {
    const input = await source(await tone('mono.wav', 1, 1));
    const probed = await probeAudioSource(input);
    expect(probed.channels).toBe(1);
    const asked = resolveAssetUploadSettings(
      { type: 'audio-transform', quality: 75, mono: false },
      probed,
    );
    expect(buildAssetSettingsKey(asked)).toBe('audio-transform:q75:mono:1');
  });

  it('refuses a file with no sound in it', async () => {
    const path = join(directory, 'not-sound.wav');
    await writeFile(path, 'only words, no sound');
    await expect(probeAudioSource(await source(path))).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(readAudioDetails(path)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('keeps a weba as it is, without its tags', async () => {
    const input = await source(await tone('tagged.wav', 1));
    const encoded = await processAudioToOpus(input, {
      type: 'audio-transform',
      quality: 75,
      mono: false,
    });
    outputs.push(encoded.bytes.path!);
    const kept = await stripAssetMetadata(
      encoded.bytes.path!,
      'weba',
      AssetType.Audio,
    );
    expect(kept).toBeTruthy();
    outputs.push(kept!);
    expect((await readAudioDetails(kept!)).inspection.audioCodec).toBe('opus');
  });
});
