import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const here = fileURLToPath(new URL('.', import.meta.url));
const tmpDir = join(here, '.tmp');
const samplePath = join(tmpDir, 'sample.webm');
const resizedPath = join(tmpDir, 'resized.webm');

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });

console.log(`ffmpeg: ${ffmpegInstaller.path}`);

await runFfmpeg([
  '-y',
  '-hide_banner',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=duration=2:size=1280x720:rate=30',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=2',
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '0',
  '-crf',
  '38',
  '-c:a',
  'libopus',
  samplePath,
]);

await runFfmpeg([
  '-y',
  '-hide_banner',
  '-i',
  samplePath,
  '-vf',
  "scale='min(640\\,iw)':-2",
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '0',
  '-crf',
  '38',
  '-an',
  resizedPath,
]);

const sample = await inspectWithFfmpeg(samplePath);
const resized = await inspectWithFfmpeg(resizedPath);

console.log('sample:', sample);
console.log('resized:', resized);

assertInspection(sample, { width: 1280, height: 720, hasAudio: true });
assertInspection(resized, { width: 640, height: 360, hasAudio: false });

await rm(tmpDir, { recursive: true, force: true });

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function inspectWithFfmpeg(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegInstaller.path,
      ['-hide_banner', '-i', filePath],
      {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', () => {
      const inspection = parseInspection(stderr);
      if (!inspection.width || !inspection.height) {
        reject(new Error(`No dimensions parsed:\n${stderr}`));
        return;
      }
      resolve(inspection);
    });
  });
}

function parseInspection(text) {
  const videoLine = text
    .split(/\r?\n/)
    .find((line) => /Stream #.*Video:/.test(line));
  const dimensionsMatch = videoLine?.match(/,\s*(\d{2,5})x(\d{2,5})(?:\s|,)/);
  const durationMatch = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);

  return {
    ...(dimensionsMatch
      ? {
          width: Number(dimensionsMatch[1]),
          height: Number(dimensionsMatch[2]),
        }
      : {}),
    ...(durationMatch ? { duration: parseTimemark(durationMatch[1]) } : {}),
    hasAudio: /Stream #.*Audio:/.test(text),
  };
}

function parseTimemark(timemark) {
  const match = timemark.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function assertInspection(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`${key}: expected ${value}, got ${actual[key]}`);
    }
  }
}
