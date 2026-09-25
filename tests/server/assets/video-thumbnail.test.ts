import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { AssetType } from '../../../shared/asset';
import { createMediaPreview } from '../../../server/thei/assets/media-preview';
import {
  extractVideoThumbnail,
  FLAT_FRAME_SPREAD,
  frameLiveliness,
} from '../../../server/thei/assets/video-thumbnail';

let directory = '';

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-video-thumbnail-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

/** A clip made of solid-colour stretches, one after the other. */
async function makeClip(name: string, stretches: [string, number][]) {
  const path = join(directory, name);
  await run([
    '-y',
    ...stretches.flatMap(([color, seconds]) => [
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=64x64:r=25:d=${seconds}`,
    ]),
    '-filter_complex',
    `${stretches.map((_, index) => `[${index}:v]`).join('')}concat=n=${stretches.length}:v=1:a=0`,
    '-c:v',
    'mpeg4',
    '-q:v',
    '2',
    path,
  ]);
  return await readFile(path);
}

async function meanColor(image: Buffer) {
  const { channels } = await sharp(image).stats();
  return channels.slice(0, 3).map((channel) => Math.round(channel.mean));
}

describe('video thumbnails', () => {
  it('passes over a black opening for a frame that shows the video', async () => {
    const clip = await makeClip('fade.mp4', [
      ['black', 1],
      ['red', 3],
    ]);
    const { frame, at } = await extractVideoThumbnail(clip);
    const [red, green, blue] = await meanColor(frame);
    expect(at).toBeGreaterThan(0);
    expect(red).toBeGreaterThan(200);
    expect(green).toBeLessThan(40);
    expect(blue).toBeLessThan(40);
  }, 60_000);

  it('still yields a frame when the whole clip is one colour', async () => {
    const clip = await makeClip('black.mp4', [['black', 2]]);
    const { frame } = await extractVideoThumbnail(clip);
    const meta = await sharp(frame).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
  }, 60_000);

  it('feeds the chosen frame to the preview', async () => {
    const clip = await makeClip('preview.mp4', [
      ['white', 1],
      ['blue', 3],
    ]);
    const preview = await createMediaPreview(clip, AssetType.Video);
    const [red, , blue] = await meanColor(preview.buffer);
    expect(blue).toBeGreaterThan(200);
    expect(red).toBeLessThan(60);
  }, 60_000);

  it('tells an empty frame from one with something in it', async () => {
    const solid = (background: string) =>
      sharp({ create: { width: 32, height: 32, channels: 3, background } })
        .png()
        .toBuffer();
    const busy = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="16" height="32" fill="#000"/><rect x="16" width="16" height="32" fill="#fff"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    expect(await frameLiveliness(await solid('#101010'))).toBeLessThan(
      FLAT_FRAME_SPREAD,
    );
    expect(await frameLiveliness(await solid('#f4f4f4'))).toBeLessThan(
      FLAT_FRAME_SPREAD,
    );
    // A faint tint on black is still black.
    expect(await frameLiveliness(await solid('#050514'))).toBeLessThan(
      FLAT_FRAME_SPREAD,
    );
    expect(await frameLiveliness(await solid('#c02020'))).toBeGreaterThan(
      FLAT_FRAME_SPREAD,
    );
    expect(await frameLiveliness(busy)).toBeGreaterThan(FLAT_FRAME_SPREAD);
  });
});
