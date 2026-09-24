import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildVideoEncodePasses,
  buildVideoScaleFilters,
  parseFfmpegInputInfo,
  processOriginalAsset,
  scaleProgress,
  sourceVideoBitrate,
} from '../../../server/thei/assets/process';
import { videoTargetBitrate } from '../../../shared/asset-upload-quality';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-process-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function stage(bytes: string, extension: string) {
  const path = join(directory, `source.${extension}`);
  const buffer = Buffer.from(bytes);
  await writeFile(path, buffer);
  return {
    path,
    size: buffer.length,
    hash: createHash('sha256').update(buffer).digest('hex'),
    extension,
    owned: true,
  };
}

describe('original asset content validation', () => {
  it('rejects invalid image content even when the extension looks like an image', async () => {
    await expect(
      processOriginalAsset(await stage('not an image', 'png')),
    ).rejects.toThrow('Invalid image file');
  });

  it('rejects invalid video content even when the extension looks like a video', async () => {
    await expect(
      processOriginalAsset(await stage('not a video', 'mp4')),
    ).rejects.toThrow('Invalid video file');
  });

  it('hands the staged file through without reading it into memory', async () => {
    const source = await stage('arbitrary bytes', 'bin');
    const processed = await processOriginalAsset(source);

    // An untransformed upload is stored by moving the file that is already on
    // disk, so the bytes must never become a buffer on the way there.
    expect(processed.bytes).toEqual({
      path: source.path,
      size: source.size,
      hash: source.hash,
      owned: true,
    });
    expect(processed.bytes.buffer).toBeUndefined();
  });
});

describe('video transform filters', () => {
  const settings = {
    type: 'video-transform' as const,
    quality: 85,
    stripAudio: false,
    fastConversion: false,
    crop: { left: 0, top: 100, width: 720, height: 720 },
    dimensions: { width: 480, height: 480 },
  };

  it('crops, then scales', () => {
    expect(buildVideoScaleFilters(settings)).toEqual([
      'crop=720:720:0:100',
      'scale=480:480:flags=lanczos',
    ]);
  });

  it('turns first, so the crop is in the turned frame', () => {
    expect(buildVideoScaleFilters({ ...settings, rotation: 90 })[0]).toBe(
      'transpose=clock',
    );
    expect(buildVideoScaleFilters({ ...settings, rotation: 180 })[0]).toBe(
      'hflip,vflip',
    );
    expect(buildVideoScaleFilters({ ...settings, rotation: 270 })[0]).toBe(
      'transpose=cclock',
    );
  });
});

describe('ffmpeg input info', () => {
  const stream = (extra: string) =>
    [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':",
      '  Duration: 00:00:03.00, start: 0.000000, bitrate: 900 kb/s',
      '  Stream #0:0(und): Video: h264 (High), yuv420p, 1920x1080, 850 kb/s, 30 fps',
      extra,
      '  Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s',
    ].join('\n');

  it('reports the coded size of an unrotated stream', () => {
    expect(parseFfmpegInputInfo(stream(''))).toEqual({
      width: 1920,
      height: 1080,
      duration: 3,
      hasAudio: true,
      fps: 30,
      bitrate: 850_000,
      overallBitrate: 900_000,
      audioBitrate: 128_000,
      codec: 'h264',
    });
  });

  it('reads a fractional frame rate and does without stream bitrates', () => {
    const info = parseFfmpegInputInfo(
      [
        "Input #0, matroska,webm, from 'clip.webm':",
        '  Duration: 00:00:10.00, start: 0.000000, bitrate: 1200 kb/s',
        '  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv), 1280x720, SAR 1:1 DAR 16:9, 29.97 fps, 29.97 tbr, 1k tbn, 1k tbc (default)',
        '  Stream #0:1: Audio: opus, 48000 Hz, stereo, fltp (default)',
      ].join('\n'),
    );
    expect(info).toMatchObject({
      fps: 29.97,
      overallBitrate: 1_200_000,
      codec: 'vp9',
      hasAudio: true,
    });
    expect(info.bitrate).toBeUndefined();
    expect(info.audioBitrate).toBeUndefined();
  });

  it('takes the video bitrate from the stream, the file, or the size', () => {
    const base = { width: 1280, height: 720, duration: 10, hasAudio: true };
    expect(sourceVideoBitrate({ ...base, bitrate: 850_000 })).toBe(850_000);
    expect(
      sourceVideoBitrate({
        ...base,
        overallBitrate: 1_200_000,
        audioBitrate: 96_000,
      }),
    ).toBe(1_104_000);
    // No audio rate known: the usual 128k is assumed.
    expect(sourceVideoBitrate({ ...base, overallBitrate: 1_200_000 })).toBe(
      1_072_000,
    );
    // Nothing but the file: its size over its duration, less the sound.
    expect(sourceVideoBitrate(base, 1_500_000)).toBe(1_072_000);
    expect(sourceVideoBitrate({ ...base, hasAudio: false }, 1_500_000)).toBe(
      1_200_000,
    );
    expect(sourceVideoBitrate(base)).toBeUndefined();
  });

  it('swaps the sides of a stream tagged with a quarter turn', () => {
    const info = parseFfmpegInputInfo(
      stream('    Metadata:\n      rotate          : 90'),
    );
    expect(info).toMatchObject({ width: 1080, height: 1920 });
  });

  it('swaps the sides of a stream with a rotated display matrix', () => {
    const info = parseFfmpegInputInfo(
      stream('    Side data:\n      displaymatrix: rotation of -90.00 degrees'),
    );
    expect(info).toMatchObject({ width: 1080, height: 1920 });
  });

  it('keeps the sides of a half turn', () => {
    const info = parseFfmpegInputInfo(
      stream('    Side data:\n      displaymatrix: rotation of 180.00 degrees'),
    );
    expect(info).toMatchObject({ width: 1920, height: 1080 });
  });
});

describe('video encode passes', () => {
  const settings = {
    type: 'video-transform' as const,
    quality: 75,
    stripAudio: false,
    fastConversion: false,
    dimensions: { width: 1280, height: 720 },
  };
  const source = { width: 1920, height: 1080, fps: 30, hasAudio: true };
  const target = videoTargetBitrate(75, settings.dimensions, source);

  it('gathers statistics first, then writes at the target bitrate', () => {
    const passes = buildVideoEncodePasses(settings, source, '/tmp/log');
    expect(passes.first).toEqual(
      expect.arrayContaining([
        '-an',
        '-pass 1',
        '-passlogfile /tmp/log',
        '-f null',
        `-b:v ${target}`,
      ]),
    );
    expect(passes.first).not.toEqual(expect.arrayContaining(['-c:a libopus']));
    expect(passes.second).toEqual(
      expect.arrayContaining([
        '-c:v libvpx-vp9',
        '-pass 2',
        '-passlogfile /tmp/log',
        '-c:a libopus',
        '-b:a 128000',
        `-b:v ${target}`,
        `-maxrate ${Math.round(target * 1.45)}`,
        '-vf scale=1280:720:flags=lanczos',
      ]),
    );
    expect(passes.second).not.toEqual(expect.arrayContaining(['-f null']));
    expect(passes.second.join(' ')).not.toContain('-crf');
  });

  it('gives the sound less at a low level and drops it when asked', () => {
    expect(
      buildVideoEncodePasses({ ...settings, quality: 40 }, source, '/tmp/log')
        .second,
    ).toEqual(expect.arrayContaining(['-b:a 64000']));
    expect(
      buildVideoEncodePasses(
        { ...settings, stripAudio: true },
        source,
        '/tmp/log',
      ).second,
    ).toEqual(expect.arrayContaining(['-an']));
    expect(
      buildVideoEncodePasses(
        settings,
        { ...source, hasAudio: false },
        '/tmp/log',
      ).second,
    ).toEqual(expect.arrayContaining(['-an']));
  });

  it('makes a fast conversion in one realtime pass', () => {
    const passes = buildVideoEncodePasses(
      { ...settings, fastConversion: true },
      source,
      '/tmp/log',
    );
    expect(passes.first).toBeUndefined();
    expect(passes.second).toEqual(
      expect.arrayContaining(['-deadline realtime', `-b:v ${target}`]),
    );
    expect(passes.second.join(' ')).not.toContain('-pass');
  });

  it('maps each pass onto its share of the whole', () => {
    const seen: number[] = [];
    const first = scaleProgress((p) => seen.push(p), 0, 0.2)!;
    const second = scaleProgress((p) => seen.push(p), 0.2, 0.8)!;
    first(0.5);
    first(1);
    second(0.5);
    second(1);
    expect(seen.map((p) => Math.round(p * 100) / 100)).toEqual([
      0.1, 0.2, 0.6, 1,
    ]);
    expect(scaleProgress(undefined, 0, 1)).toBeUndefined();
  });
});
