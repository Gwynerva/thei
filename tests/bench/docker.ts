/**
 * The media bench on a box like a small VPS:
 *
 *   bun tests/bench/docker.ts [--cpus 1] [--memory 2g] [--quick] [--seconds 6]
 *
 * Runs `tests/bench/media.test.ts` in the release bench's `ready` image
 * (Debian 12, Bun, Node) with the CPU and memory limits given, the
 * repository mounted read-only and `node_modules`, `.thei` (where the
 * pinned ffmpeg lands) and the test artifacts on volumes of their own, so a
 * run leaves the checkout as it was. The report lands beside the local one,
 * as `tests/.artifacts/media-bench/report-docker-<cpus>cpu.md`.
 *
 * Docker Desktop on Windows runs Linux containers in a VM whose CPU budget
 * is what `--cpus` is counted against.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const cpus = argument('cpus', '1');
const memory = argument('memory', '2g');
const quick = flag('quick');
const seconds = argument('seconds', quick ? '5' : '8');
const label = `docker-${cpus}cpu`;

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const image = 'thei-media-bench:ready';
const dockerfile = readFileSync(
  resolve(repo, 'tests', 'release', 'Dockerfile'),
  'utf8',
);

function run(command: string, args: string[], input?: string): void {
  const result = spawnSync(command, args, {
    stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    input,
    cwd: repo,
  });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(' ')} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Building ${image} from tests/release/Dockerfile (target ready)…`);
run(
  'docker',
  ['build', '-q', '--target', 'ready', '-t', image, '-'],
  dockerfile,
);

// A slash path for the mount source: Docker on Windows takes C:/… as it is.
const mountRepo = repo.replace(/\\/g, '/');
const script = [
  'set -euo pipefail',
  'cd /work',
  // The repository is read-only; the lockfile stays as it is.
  'bun install --no-save 2>&1 | tail -3',
  'bun update/ffmpeg/cli.ts --project /work',
  `THEI_MEDIA_BENCH=1 THEI_MEDIA_BENCH_LABEL=${label} THEI_MEDIA_BENCH_SECONDS=${seconds} ${
    quick ? 'THEI_MEDIA_BENCH_QUICK=1 ' : ''
  }bun vitest run tests/bench/media.test.ts`,
].join('\n');

console.log(`Running the bench with --cpus ${cpus} --memory ${memory}…`);
run(
  'docker',
  [
    'run',
    '--rm',
    '-i',
    `--cpus=${cpus}`,
    `--memory=${memory}`,
    `--memory-swap=${memory}`,
    '-v',
    `${mountRepo}:/work:ro`,
    '-v',
    'thei-media-bench-node-modules:/work/node_modules',
    '-v',
    'thei-media-bench-thei:/work/.thei',
    '-v',
    `${mountRepo}/tests/.artifacts:/work/tests/.artifacts`,
    '-e',
    'HOME=/root',
    image,
    'bash',
    '-s',
  ],
  script,
);
