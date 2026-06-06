import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const here = fileURLToPath(new URL('.', import.meta.url));
const tmpDir = join(here, '.tmp');
const outputPath = join(tmpDir, 'progress-test.webm');
const duration = 12;

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });

const observations = {
  progressPipe: [],
  stderrStats: [],
};

const args = [
  '-y',
  '-nostdin',
  '-hide_banner',
  '-loglevel',
  'info',
  '-stats',
  '-progress',
  'pipe:1',
  '-f',
  'lavfi',
  '-i',
  `testsrc2=duration=${duration}:size=1280x720:rate=30`,
  '-f',
  'lavfi',
  '-i',
  `sine=frequency=440:duration=${duration}`,
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-c:v',
  'libvpx-vp9',
  '-deadline',
  'good',
  '-cpu-used',
  '1',
  '-row-mt',
  '1',
  '-b:v',
  '0',
  '-crf',
  '38',
  '-c:a',
  'libopus',
  '-b:a',
  '96k',
  '-pix_fmt',
  'yuv420p',
  outputPath,
];

console.log(`ffmpeg: ${ffmpegInstaller.path}`);
console.log(`args: ${args.join(' ')}`);

await runFfmpeg(args);

const progressPipeMidpoints = midpoints(observations.progressPipe);
const stderrStatsMidpoints = midpoints(observations.stderrStats);

console.log('progress pipe samples:', summarize(observations.progressPipe));
console.log('stderr stats samples:', summarize(observations.stderrStats));
console.log('progress pipe midpoint count:', progressPipeMidpoints.length);
console.log('stderr stats midpoint count:', stderrStatsMidpoints.length);

if (progressPipeMidpoints.length === 0 && stderrStatsMidpoints.length === 0) {
  throw new Error('No live progress was observed before completion.');
}

await rm(tmpDir, { recursive: true, force: true });

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let errorTail = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const progress = parseProgressLine(line);
        if (progress !== undefined) observations.progressPipe.push(progress);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      errorTail = `${errorTail}${chunk}`.slice(-8000);
      stderrBuffer += chunk;
      const records = stderrBuffer.split(/\r|\n/);
      stderrBuffer = records.pop() ?? '';
      for (const record of records) {
        const progress = parseStatsProgress(record);
        if (progress !== undefined) observations.stderrStats.push(progress);
      }
      const chunkProgress = parseStatsProgress(chunk);
      if (chunkProgress !== undefined)
        observations.stderrStats.push(chunkProgress);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(errorTail.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function parseProgressLine(line) {
  const separatorIndex = line.indexOf('=');
  if (separatorIndex === -1) return undefined;
  const key = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const seconds =
    key === 'out_time_us' || key === 'out_time_ms'
      ? Number(value) / 1_000_000
      : key === 'out_time'
        ? parseTimemark(value)
        : undefined;
  return secondsToProgress(seconds);
}

function parseStatsProgress(text) {
  const matches = [...text.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
  const match = matches.at(-1);
  return secondsToProgress(match ? parseTimemark(match[1]) : undefined);
}

function secondsToProgress(seconds) {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  return Math.max(0, Math.min(1, seconds / duration));
}

function parseTimemark(timemark) {
  const match = timemark.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function midpoints(values) {
  return values.filter((value) => value > 0.02 && value < 0.98);
}

function summarize(values) {
  return values
    .filter(
      (_, index) => index % Math.max(1, Math.floor(values.length / 10)) === 0,
    )
    .map((value) => `${Math.round(value * 100)}%`)
    .join(', ');
}
