import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildVideoEncodePasses,
  buildVideoScaleFilters,
  planResizeBeforeCrop,
  processOriginalAsset,
  videoColorFilters,
  scaleProgress,
  sourceVideoBitrate,
} from '../../../server/thei/assets/process';
import {
  inspectionFromProbe,
  isHdr,
  type FfprobeOutput,
} from '../../../server/thei/assets/probe';
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

describe('ffprobe input info', () => {
  const clip = (
    video: Partial<FfprobeOutput['streams']>[number] = {},
  ): FfprobeOutput => ({
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        pix_fmt: 'yuv420p',
        color_transfer: 'bt709',
        color_primaries: 'bt709',
        color_space: 'bt709',
        bit_rate: '850000',
        avg_frame_rate: '30/1',
        r_frame_rate: '30/1',
        ...video,
      },
      {
        codec_type: 'audio',
        codec_name: 'aac',
        sample_rate: '48000',
        channels: 2,
        bit_rate: '128000',
      },
    ],
    format: { duration: '3.000000', bit_rate: '900000' },
  });

  it('reports the coded size of an unrotated stream', () => {
    expect(inspectionFromProbe(clip())).toEqual({
      width: 1920,
      height: 1080,
      duration: 3,
      hasAudio: true,
      fps: 30,
      bitrate: 850_000,
      overallBitrate: 900_000,
      audioBitrate: 128_000,
      codec: 'h264',
      audioCodec: 'aac',
      channels: 2,
      sampleRate: 48_000,
      pixelFormat: 'yuv420p',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorSpace: 'bt709',
    });
  });

  it('reads a fractional frame rate and does without stream bitrates', () => {
    const info = inspectionFromProbe({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'vp9',
          width: 1280,
          height: 720,
          pix_fmt: 'yuv420p',
          avg_frame_rate: '30000/1001',
          r_frame_rate: '30000/1001',
        },
        {
          codec_type: 'audio',
          codec_name: 'opus',
          sample_rate: '48000',
          channels: 2,
        },
      ],
      format: { duration: '10.000000', bit_rate: '1200000' },
    });
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
    const info = inspectionFromProbe(clip({ tags: { rotate: '90' } }));
    expect(info).toMatchObject({ width: 1080, height: 1920 });
  });

  it('swaps the sides of a stream with a rotated display matrix', () => {
    const info = inspectionFromProbe(
      clip({
        side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }],
      }),
    );
    expect(info).toMatchObject({ width: 1080, height: 1920 });
  });

  it('keeps the sides of a half turn', () => {
    const info = inspectionFromProbe(
      clip({
        side_data_list: [{ side_data_type: 'Display Matrix', rotation: 180 }],
      }),
    );
    expect(info).toMatchObject({ width: 1920, height: 1080 });
  });

  it('passes over a cover picture and reads a file with no picture at all', () => {
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
    expect(info.width).toBeUndefined();
    expect(info.codec).toBeUndefined();
    expect(inspectionFromProbe({})).toEqual({ hasAudio: false });
  });

  it('tells a ten-bit HDR recording from an SDR one', () => {
    const hdr = inspectionFromProbe(
      clip({
        pix_fmt: 'yuv420p10le',
        color_transfer: 'arib-std-b67',
        color_primaries: 'bt2020',
        color_space: 'bt2020nc',
      }),
    );
    expect(hdr).toMatchObject({
      pixelFormat: 'yuv420p10le',
      colorTransfer: 'arib-std-b67',
      colorPrimaries: 'bt2020',
    });
    expect(isHdr(hdr)).toBe(true);
    expect(
      isHdr(inspectionFromProbe(clip({ color_transfer: 'smpte2084' }))),
    ).toBe(true);
    expect(isHdr(inspectionFromProbe(clip()))).toBe(false);
  });
});

describe('resize before crop', () => {
  const frame = { width: 6000, height: 4000 };

  it('scales the whole frame by the crop and cuts the crop out of it', () => {
    const plan = planResizeBeforeCrop(
      frame,
      { left: 500, top: 300, width: 4800, height: 3200 },
      { width: 1600, height: 1067 },
    );
    expect(plan).toEqual({
      width: 2000,
      height: 1334,
      crop: { left: 167, top: 100, width: 1600, height: 1067 },
    });
  });

  it('keeps the crop inside the scaled frame whatever the rounding', () => {
    const plan = planResizeBeforeCrop(
      { width: 1600, height: 900 },
      { left: 700, top: 0, width: 900, height: 900 },
      { width: 256, height: 256 },
    );
    expect(plan!.crop!.left + plan!.crop!.width).toBeLessThanOrEqual(
      plan!.width,
    );
    expect(plan!.crop!.top + plan!.crop!.height).toBeLessThanOrEqual(
      plan!.height,
    );
    expect(plan!.crop).toMatchObject({ width: 256, height: 256 });
  });

  it('is a plain resize without a crop, and nothing when the output enlarges', () => {
    expect(
      planResizeBeforeCrop(frame, undefined, { width: 1600, height: 1067 }),
    ).toEqual({ width: 1600, height: 1067 });
    expect(
      planResizeBeforeCrop(frame, undefined, { width: 8000, height: 5333 }),
    ).toBeUndefined();
    expect(
      planResizeBeforeCrop(
        frame,
        { left: 0, top: 0, width: 400, height: 300 },
        { width: 800, height: 600 },
      ),
    ).toBeUndefined();
  });
});

describe('video colour', () => {
  it('maps an HDR source to BT.709 after the scale, and tags the file so', () => {
    const settings = {
      type: 'video-transform' as const,
      quality: 75,
      dimensions: { width: 1280, height: 720 },
      stripAudio: false,
    };
    expect(videoColorFilters({})).toEqual([]);
    expect(videoColorFilters({ colorTransfer: 'bt709' })).toEqual([]);
    for (const colorTransfer of ['smpte2084', 'arib-std-b67']) {
      const filters = buildVideoScaleFilters(settings, { colorTransfer });
      expect(filters[0]).toMatch(/^scale=1280:720/);
      expect(filters.slice(1)).toEqual([
        `zscale=tin=${colorTransfer}:pin=bt2020:min=bt2020nc:t=linear:p=bt2020:npl=100`,
        'format=gbrpf32le',
        'zscale=p=bt709',
        'tonemap=tonemap=hable:desat=0',
        'zscale=t=bt709:m=bt709:r=tv',
        'format=yuv420p',
      ]);
      const passes = buildVideoEncodePasses(
        settings,
        { width: 1920, height: 1080, hasAudio: true, colorTransfer },
        'log',
      );
      expect(passes.second).toEqual(
        expect.arrayContaining([
          '-colorspace bt709',
          '-color_primaries bt709',
          '-color_trc bt709',
        ]),
      );
    }
    const sdr = buildVideoEncodePasses(
      settings,
      { width: 1920, height: 1080, hasAudio: true, colorTransfer: 'bt709' },
      'log',
    );
    expect(sdr.second.join(' ')).not.toContain('color_primaries');
    expect(sdr.second.join(' ')).not.toContain('tonemap');
  });

  it('tells zscale what the source is, taking BT.2020 for what is not tagged', () => {
    const first = (source: Parameters<typeof videoColorFilters>[0]) =>
      videoColorFilters(source)[0];
    // Tagged in full, as a phone writes it: read as tagged.
    expect(
      first({
        colorTransfer: 'arib-std-b67',
        colorPrimaries: 'bt2020',
        colorSpace: 'bt2020nc',
      }),
    ).toBe(
      'zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:t=linear:p=bt2020:npl=100',
    );
    expect(
      first({
        colorTransfer: 'smpte2084',
        colorPrimaries: 'bt709',
        colorSpace: 'bt709',
      }),
    ).toBe('zscale=tin=smpte2084:pin=bt709:min=bt709:t=linear:p=bt709:npl=100');
    // Tagged by its transfer alone, or with what zscale has no name for.
    for (const partly of [
      { colorTransfer: 'smpte2084' },
      {
        colorTransfer: 'smpte2084',
        colorPrimaries: 'unknown',
        colorSpace: 'reserved',
      },
    ]) {
      expect(first(partly)).toBe(
        'zscale=tin=smpte2084:pin=bt2020:min=bt2020nc:t=linear:p=bt2020:npl=100',
      );
    }
  });
});

describe('video encode passes', () => {
  const settings = {
    type: 'video-transform' as const,
    quality: 75,
    stripAudio: false,
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
