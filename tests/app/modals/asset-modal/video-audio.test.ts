import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { detectVideoAudio } from '../../../../app/modals/asset-modal/video-audio';

let directory = '';

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-video-audio-'));
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

async function makeVideo(name: string, audio: boolean, codecArgs: string[]) {
  const path = join(directory, name);
  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=32x32:d=0.5',
    ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5'] : []),
    ...codecArgs,
    '-shortest',
    path,
  ]);
  return new Blob([await readFile(path)]);
}

const cases: [string, string, string[]][] = [
  ['mp4', 'mp4', ['-c:v', 'mpeg4']],
  ['faststart.mp4', 'mp4', ['-c:v', 'mpeg4', '-movflags', '+faststart']],
  ['mov', 'mov', ['-c:v', 'mpeg4']],
  ['webm', 'webm', ['-c:v', 'libvpx-vp9', '-c:a', 'libopus']],
  ['avi', 'avi', ['-c:v', 'mpeg4']],
];

describe('detectVideoAudio', () => {
  for (const [name, extension, codecArgs] of cases) {
    it(`reads the track list of ${name}`, async () => {
      const withAudio = await makeVideo(`audio.${name}`, true, codecArgs);
      const silent = await makeVideo(`silent.${name}`, false, codecArgs);
      expect(await detectVideoAudio(withAudio, extension)).toBe(true);
      expect(await detectVideoAudio(silent, extension)).toBe(false);
    }, 30_000);
  }

  it('reports unknown for unreadable files', async () => {
    const garbage = new Blob([new Uint8Array(64).fill(7)]);
    expect(await detectVideoAudio(garbage, 'mp4')).toBeUndefined();
    expect(await detectVideoAudio(garbage, 'webm')).toBeUndefined();
    expect(await detectVideoAudio(garbage, 'avi')).toBeUndefined();
  });
});
