import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFfmpegTools } from '../../../update/ffmpeg/tools';

/**
 * A video of this run alone, so its bytes are new to the library and nothing
 * an earlier run left on its family — a frame chosen by hand above all —
 * comes back as this run's: a grey second, which the automatic pick passes
 * over, then two seconds of a colour drawn for the run. Made by the ffmpeg
 * Thei pins. The directory is the caller's to remove.
 */
export async function freshClip(): Promise<{
  path: string;
  remove(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'thei-e2e-frames-'));
  const path = join(directory, 'frames.mp4');
  // A full colour of a hue of its own, livelier than grey whatever it is.
  const hue = Math.random() * 6;
  const rising = Math.round(255 * (1 - Math.abs((hue % 2) - 1)));
  const [red, green, blue] = [
    [255, rising, 0],
    [rising, 255, 0],
    [0, 255, rising],
    [0, rising, 255],
    [rising, 0, 255],
    [255, 0, rising],
  ][Math.floor(hue)]!;
  const colour = `0x${[red, green, blue]
    .map((channel) => channel!.toString(16).padStart(2, '0'))
    .join('')}`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      resolveFfmpegTools().ffmpeg,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=gray:s=320x180:r=25:d=1',
        '-f',
        'lavfi',
        '-i',
        `color=c=${colour}:s=320x180:r=25:d=2`,
        '-filter_complex',
        '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p',
        '-c:v',
        'libx264',
        path,
      ],
      { stdio: 'ignore' },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
  return {
    path,
    remove: () => rm(directory, { recursive: true, force: true }),
  };
}
