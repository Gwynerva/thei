import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFfmpegTools } from '../../../update/ffmpeg/tools';
import {
  processMediaTransformAsset,
  processOriginalAsset,
} from '../../../server/thei/assets/process';
import { probeMedia } from '../../../server/thei/assets/probe';
import {
  probeAudioSource,
  readAudioDetails,
} from '../../../server/thei/assets/audio';
import { makeClip, makeRecording } from '../../helpers/media';

/**
 * A site without its tools, or with an ffprobe that does not answer: what is
 * missing is said as such, and nothing is taken from an upload for want of
 * an answer — not its validity, not its sound.
 */
let directory = '';
const saved = {
  ffmpeg: process.env.THEI_FFMPEG,
  ffprobe: process.env.THEI_FFPROBE,
};
const real = resolveFfmpegTools();

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-ffmpeg-missing-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

afterEach(() => {
  for (const [name, value] of [
    ['THEI_FFMPEG', saved.ffmpeg],
    ['THEI_FFPROBE', saved.ffprobe],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function useTools(tools: { ffmpeg: string; ffprobe?: string }) {
  process.env.THEI_FFMPEG = tools.ffmpeg;
  if (tools.ffprobe) process.env.THEI_FFPROBE = tools.ffprobe;
  else delete process.env.THEI_FFPROBE;
}

async function stage(bytes: string, extension: string) {
  const path = join(directory, `staged-${extension}`);
  await writeFile(path, bytes);
  return {
    path,
    size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'),
    extension,
    owned: false,
  };
}

describe('without ffmpeg', () => {
  it('says ffmpeg is missing rather than that the video is invalid', async () => {
    useTools({ ffmpeg: join(directory, 'nowhere', 'ffmpeg') });
    const video = processOriginalAsset(await stage('a video', 'mp4'));
    await expect(video).rejects.toThrow(/ffmpeg is not installed/);
    await expect(video).rejects.not.toThrow(/Invalid video file/);
    // A 503 the admin tells apart, to say it in its own words.
    await expect(video).rejects.toMatchObject({
      statusCode: 503,
      data: { ffmpegMissing: true },
    });
  });

  it('says ffmpeg is missing rather than that the recording is unreadable', async () => {
    const recording = await makeRecording(join(directory, 'tone.wav'), {
      seconds: 1,
    });
    useTools({ ffmpeg: join(directory, 'nowhere', 'ffmpeg') });
    await expect(probeAudioSource(recording)).rejects.toThrow(
      /ffmpeg is not installed/,
    );
    await expect(readAudioDetails(recording.path)).rejects.toThrow(
      /ffmpeg is not installed/,
    );
    // ffmpeg there, ffprobe not: the decode would go on, the probe says so.
    useTools({
      ffmpeg: real.ffmpeg,
      ffprobe: join(directory, 'nowhere', 'ffprobe'),
    });
    await expect(readAudioDetails(recording.path)).rejects.toThrow(
      /ffmpeg is not installed/,
    );
  }, 30_000);

  it('keeps the sound of a video the probe could not read', async () => {
    const clip = await makeClip(join(directory, 'clip.mp4'), {
      width: 160,
      height: 90,
      seconds: 1,
      audio: true,
    });
    // ffmpeg standing in for ffprobe runs, and refuses ffprobe's options.
    useTools({ ffmpeg: real.ffmpeg, ffprobe: real.ffmpeg });
    const processed = await processMediaTransformAsset(clip, {
      type: 'video-transform',
      quality: 50,
      stripAudio: false,
      dimensions: { width: 160, height: 90 },
    });
    try {
      useTools(real);
      expect((await probeMedia(processed.bytes.path!)).hasAudio).toBe(true);
    } finally {
      await rm(processed.bytes.path!, { force: true });
    }
  }, 60_000);
});
