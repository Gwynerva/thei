/**
 * The machinery of the release bench: Docker containers that stand in for a
 * fresh server, a local repository to install from, and a way to talk to the
 * instance inside. Scenarios live in `run.ts`, the site they share in
 * `seed.ts`.
 */
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  isStableVersion,
  newestVersion,
  normalizeVersion,
} from '../../update/semver';

export const benchDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(benchDir, '..', '..');
export const artifactsDir = join(benchDir, '.artifacts');
export const workDir = join(artifactsDir, 'work');
/** Where the bench repository lives inside every container. */
export const benchRepository = 'file:///srv/thei.git';

/**
 * `full` is a fresh VPS every time: the installer fetches Bun and Node,
 * packages come from the network, a server has 2 GB, one scenario at a time.
 * `fast` starts from an image that has the runtimes, keeps a package cache
 * per scenario and runs scenarios side by side.
 */
export const mode: 'fast' | 'full' =
  process.env.THEI_BENCH_MODE === 'full' || process.argv.includes('--full')
    ? 'full'
    : 'fast';
const image =
  mode === 'full' ? 'thei-release-bench' : 'thei-release-bench-ready';
const cacheInContainer = '/var/cache/thei-bench-bun';
/**
 * Where installs keep what they download: Bun's packages, and the native
 * binaries that prebuild-install fetches from GitHub for better-sqlite3 into
 * the npm cache — without it, every run depends on GitHub answering.
 */
const cacheEnv = {
  BUN_INSTALL_CACHE_DIR: cacheInContainer,
  npm_config_cache: `${cacheInContainer}/npm`,
};

/** The bare repositories scenarios install from, prepared once per run. */
export const repositories = {
  /** Released tags and the working tree. */
  current: join(workDir, 'thei.git'),
  /** The same, and a synthetic release after the working tree. */
  next: join(workDir, 'thei-next.git'),
};

mkdirSync(artifactsDir, { recursive: true });
const logFile = join(artifactsDir, 'bench.log');
const logPrefix = process.env.THEI_BENCH_SCENARIO
  ? `[${process.env.THEI_BENCH_SCENARIO}] `
  : '';

/**
 * Starts a run with nothing left from the last one. The directory itself
 * stays: on Windows it cannot go while a shell has it open.
 */
export function resetArtifacts(): void {
  for (const entry of readdirSync(artifactsDir)) {
    rmSync(join(artifactsDir, entry), { recursive: true, force: true });
  }
}

export function log(message: string): void {
  const line = `${new Date().toISOString().slice(11, 19)} ${logPrefix}${message}`;
  console.log(line);
  appendFileSync(logFile, `${line}\n`);
}

export class BenchFailure extends Error {}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BenchFailure(message);
  log(`  ok  ${message}`);
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; input?: string } = {},
): RunResult {
  const result = Bun.spawnSync([command, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: options.input === undefined ? 'ignore' : Buffer.from(options.input),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: result.exitCode ?? -1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export function must(
  command: string,
  args: string[],
  options?: Parameters<typeof run>[2],
): string {
  const result = run(command, args, options);
  if (result.code !== 0) {
    throw new BenchFailure(
      `${command} ${args.join(' ')} exited with ${result.code}\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

// --------------------------------------------------------------- versions

const git = (args: string[], cwd = repoRoot) =>
  must('git', args, { cwd }).trim();

const packageJson = () => readFileSync(join(repoRoot, 'package.json'), 'utf8');

export function nextPatch(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch! + 1}`;
}

/** The newest release tagged in this repository: where updates start from. */
export const lastRelease: string = (() => {
  const tags = git(['tag', '--list', 'v*'])
    .split('\n')
    .filter(isStableVersion)
    .map(normalizeVersion);
  const newest = newestVersion(tags);
  if (!newest)
    throw new BenchFailure('No release is tagged in this repository.');
  return newest;
})();

/**
 * The working tree, as the release it is becoming. The engine's version is
 * bumped only when a release is cut, so until then the tree is labelled as
 * the patch after the last release.
 */
export const versionUnderTest: string = (() => {
  const declared = (JSON.parse(packageJson()) as { version: string }).version;
  return compareVersions(declared, lastRelease) > 0
    ? declared
    : nextPatch(lastRelease);
})();

// ------------------------------------------------------------------ images

export function buildImage(): void {
  log(`Building the bench image (${mode})`);
  const target = mode === 'full' ? 'bare' : 'ready';
  const dockerfileText = readFileSync(join(benchDir, 'Dockerfile'), 'utf8');
  const dockerfile = createHash('sha256').update(dockerfileText).digest('hex');
  const label = 'thei.bench.dockerfile';
  // The Dockerfile copies nothing in, so it goes on stdin with no context.
  const build = run(
    'docker',
    [
      ...['build', '-q', '--target', target, '-t', image],
      ...['--label', `${label}=${dockerfile}`, '-'],
    ],
    { input: dockerfileText },
  );
  if (build.code === 0) return;
  // Even a fully cached build asks Docker Hub about the base image, and a
  // flaky link fails it. The image built last time serves as long as it was
  // built from this Dockerfile.
  const built = run('docker', [
    ...['image', 'inspect', image, '-f'],
    `{{index .Config.Labels "${label}"}}`,
  ]);
  if (built.code === 0 && built.stdout.trim() === dockerfile) {
    log(
      `Could not rebuild the image; using the one already built:\n${build.stderr.trim()}`,
    );
    return;
  }
  throw new BenchFailure(
    `docker build exited with ${build.code}\n${build.stderr || build.stdout}`,
  );
}

// -------------------------------------------------------------- repository

/**
 * A bare repository with the release tags a scenario needs, and nothing else.
 *
 * Released tags are copied in; branches are not, since installs name tags
 * only and a branch named like a tag would make that name ambiguous. The
 * version under test is the working tree as it is — uncommitted and
 * untracked files included — committed through a throwaway index, so neither
 * the branch nor the real index moves, and tagged with `versionUnderTest`.
 */
export function prepareRepository(): string {
  const bare = repositories.current;
  rmSync(bare, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  git(['init', '-q', '--bare', '--initial-branch=main', bare], workDir);
  git(['push', '-q', bare, 'refs/tags/*:refs/tags/*', 'HEAD:refs/heads/main']);

  const index = join(tmpdir(), `thei-bench-index-${process.pid}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    must('git', ['read-tree', 'HEAD'], { cwd: repoRoot, env });
    must('git', ['add', '-A'], { cwd: repoRoot, env });
    // The engine reports the version its package.json names.
    const labelled = packageJson().replace(
      /"version": "[^"]*"/,
      `"version": "${versionUnderTest}"`,
    );
    const blob = must('git', ['hash-object', '-w', '--stdin'], {
      cwd: repoRoot,
      input: labelled,
    }).trim();
    must(
      'git',
      ['update-index', '--cacheinfo', `100644,${blob},package.json`],
      {
        cwd: repoRoot,
        env,
      },
    );
    const tree = must('git', ['write-tree'], { cwd: repoRoot, env }).trim();
    const commit = git([
      'commit-tree',
      tree,
      '-p',
      'HEAD',
      '-m',
      'Release bench: working tree',
    ]);
    // Never forced: a release tag must not be moved.
    git(['push', '-q', bare, `${commit}:refs/tags/v${versionUnderTest}`]);
    log(
      `Tagged the working tree as v${versionUnderTest} (${commit.slice(0, 8)})`,
    );
  } finally {
    rmSync(index, { force: true });
  }
  return bare;
}

/**
 * A second repository with a synthetic release after the one under test. Kept
 * apart so that no other scenario is offered it as an update.
 */
export async function prepareNextRepository(
  from: string,
  next: string,
): Promise<string> {
  const bare = repositories.next;
  rmSync(bare, { recursive: true, force: true });
  git(
    ['clone', '-q', '--bare', '--no-local', repositories.current, bare],
    workDir,
  );
  await tagNextRelease(bare, from, next);
  return bare;
}

/**
 * A synthetic release after the one under test, with one of each kind of
 * update step and a changed instance template. Each step fails while its
 * marker file sits in `content/`, so the failure paths can be walked too.
 */
export async function tagNextRelease(
  bare: string,
  from: string,
  next: string,
): Promise<void> {
  const tree = join(workDir, 'next');
  rmSync(tree, { recursive: true, force: true });
  git(['clone', '-q', '--branch', `v${from}`, bare, tree], workDir);
  const path = (file: string) => join(tree, file);
  const id = (slug: string) => `${next}/001-bench-${slug}`;
  const failWhen = (marker: string, what: string) =>
    `if (existsSync(${marker})) throw new Error('The bench asked this ${what} to fail.');`;

  await Bun.write(
    path(`update/phases/${next}-bench.ts`),
    `import { existsSync } from 'node:fs';
import { defineUpdatePhase } from './types';

export default defineUpdatePhase({
  id: '${id('phase')}',
  version: '${next}',
  title: 'Bench phase',
  async run({ contentPath, log }) {
    ${failWhen("contentPath('.bench-fail-phase')", 'phase')}
    log('The bench phase ran.');
  },
});
`,
  );
  await Bun.write(
    path(`update/migrations/${next}-bench.ts`),
    `import { existsSync } from 'node:fs';
import { defineMigration } from './types';

export default defineMigration({
  id: '${id('migration')}',
  version: '${next}',
  title: 'Bench migration',
  async run({ rawDb, contentPath }) {
    ${failWhen("contentPath('.bench-fail-migration')", 'migration')}
    rawDb.prepare('CREATE TABLE IF NOT EXISTS \`bench-next\` (\`id\` integer PRIMARY KEY)').run();
  },
});
`,
  );
  await Bun.write(
    path(`update/tasks/${next}-bench.ts`),
    `import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineUpdateTask } from './types';

export default defineUpdateTask({
  id: '${id('task')}',
  version: '${next}',
  title: 'Bench task',
  progress: (done, total) => \`\${done} of \${total} bench items\`,
  async run({ progress }) {
    // The service runs in the instance directory.
    ${failWhen("join(process.cwd(), 'content', '.bench-fail-task')", 'task')}
    for (let done = 1; done <= 3; done++) await progress(done, 3);
  },
});
`,
  );

  const register = async (file: string, name: string) => {
    const source = await Bun.file(path(file)).text();
    const updated = `import ${name} from './${next}-bench';\n${source}`.replace(
      /= \[([\s\S]*?)\];/,
      (_, items: string) =>
        `= [${items.trimEnd() ? `${items.trimEnd()}\n` : '\n'}  ${name},\n];`,
    );
    if (!updated.includes(`  ${name},\n];`)) {
      throw new BenchFailure(`Could not register the bench step in ${file}.`);
    }
    await Bun.write(path(file), updated);
  };
  await register('update/phases/index.ts', 'benchPhase');
  await register('update/migrations/index.ts', 'benchMigration');
  await register('update/tasks/index.ts', 'benchTask');

  const manifest = JSON.parse(await Bun.file(path('package.json')).text());
  manifest.version = next;
  await Bun.write(
    path('package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  // A changed template makes the update install a second time with it.
  const templatePath = path('update/instance/package.tmpl.json');
  const template = JSON.parse(await Bun.file(templatePath).text());
  template.description = 'A Thei instance (bench release)';
  await Bun.write(templatePath, `${JSON.stringify(template, null, 2)}\n`);

  git(['add', '-A'], tree);
  git(
    [
      '-c',
      'user.name=bench',
      '-c',
      'user.email=bench@localhost',
      'commit',
      '-q',
      '-m',
      `Bench release ${next}`,
    ],
    tree,
  );
  git(['push', '-q', 'origin', `HEAD:refs/tags/v${next}`], tree);
  log(`Tagged a synthetic v${next}`);
}

// --------------------------------------------------------------- containers

export interface Server {
  name: string;
  /** Host port the instance's port 3000 is published on, if any. */
  port?: number;
}

/**
 * Starts a server. `cache` names the package cache it shares with earlier
 * runs of the same scenario in fast mode; scenarios never share one, so
 * side-by-side installs do not write into the same cache at once. The bench
 * itself talks to the instance from inside; a port is published only for a
 * person looking at a kept server.
 */
export function startServer(
  name: string,
  cache: string,
  port?: number,
): Server {
  run('docker', ['rm', '-f', name]);
  const resources =
    mode === 'full'
      ? // A 2 GB server with the 2 GB swap file the installer adds when short.
        ['--memory=2g', '--memory-swap=4g']
      : ['-v', `thei-bench-bun-${cache}:${cacheInContainer}`];
  must('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--hostname',
    name,
    '--privileged',
    '--cgroupns=host',
    '-v',
    '/sys/fs/cgroup:/sys/fs/cgroup:rw',
    '--tmpfs',
    '/run',
    '--tmpfs',
    '/run/lock',
    ...resources,
    ...(port === undefined ? [] : ['-p', `127.0.0.1:${port}:3000`]),
    image,
  ]);
  const server = { name, port };
  for (let attempt = 0; attempt < 60; attempt++) {
    const state = exec(server, 'systemctl is-system-running || true').stdout;
    if (/running|degraded/.test(state)) return server;
    Bun.sleepSync(500);
  }
  throw new BenchFailure(`systemd did not come up in ${name}.`);
}

export function removeServer(server: Server): void {
  run('docker', ['rm', '-f', server.name]);
}

export function exec(server: Server, script: string): RunResult {
  return run('docker', ['exec', '-i', server.name, 'bash', '-s'], {
    input: script,
  });
}

export function mustExec(server: Server, script: string): string {
  const result = exec(server, `set -euo pipefail\n${script}`);
  if (result.code !== 0) {
    throw new BenchFailure(
      `In ${server.name}: exited with ${result.code}\n${script}\n${(result.stderr || result.stdout).slice(-4000)}`,
    );
  }
  return result.stdout;
}

export function copyInto(server: Server, from: string, to: string): void {
  must('docker', ['cp', from, `${server.name}:${to}`]);
}

export function copyRepository(server: Server, bare: string): void {
  mustExec(server, 'rm -rf /srv/thei.git && mkdir -p /srv');
  copyInto(server, bare, '/srv/thei.git');
  mustExec(server, 'chmod -R a+rX /srv/thei.git');
}

// ----------------------------------------------------------------- instance

export const benchCredentials = {
  secretPhrase: 'bench',
  password: 'bench-only-password',
};

/**
 * Runs the installer of `version` inside the server. Its output goes to a log
 * in the artifacts rather than the console: it is long.
 */
export interface InstallOptions {
  /** The release whose installer runs; the installed one's by default. */
  installerFrom?: string;
  /** More environment for the installer and the installs it runs. */
  env?: Record<string, string>;
}

export function install(
  server: Server,
  version: string,
  options: InstallOptions = {},
): RunResult {
  const env: Record<string, string> = {
    THEI_REPOSITORY: benchRepository,
    THEI_VERSION: `v${version}`,
    THEI_HOST: '0.0.0.0',
    ...(mode === 'fast' ? cacheEnv : {}),
    ...options.env,
  };
  const exports = Object.entries(env)
    .map(([key, value]) => `export ${key}='${value}'`)
    .join('\n');
  // In fast mode the service's own installs, during an update, use the
  // shared cache too.
  const cacheUnit =
    mode === 'fast'
      ? `mkdir -p /etc/systemd/system/thei.service.d
printf '[Service]\\n${Object.entries(cacheEnv)
          .map(([key, value]) => `Environment=${key}=${value}\\n`)
          .join('')}' > /etc/systemd/system/thei.service.d/bench-cache.conf
systemctl daemon-reload`
      : '';
  log(`Installing Thei ${version} in ${server.name}`);
  // Bun keeps a clone of each git dependency in its cache, and a fetch does
  // not move a tag that clone already has: once cached, a tag would keep
  // installing whatever tree it named in an earlier run. Registry packages
  // stay cached; the engine is fetched afresh.
  const result = exec(
    server,
    `${exports}
mkdir -p ${cacheInContainer} && chmod 777 ${cacheInContainer}
rm -rf ${cacheInContainer}/*.git ${cacheInContainer}/@G@*
${cacheUnit}
git -C /srv/thei.git show v${options.installerFrom ?? version}:update/install.sh > /root/install.sh
bash /root/install.sh`,
  );
  if (result.code === 0) {
    // The engine installed has to be the tree the tag names, not one an
    // earlier run left in a cache.
    const installed = exec(
      server,
      `want=$(git -C /srv/thei.git rev-parse 'v${version}^{commit}')
grep -q "thei.git#$want" /opt/thei/bun.lock || { echo "installed an engine other than v${version} ($want)"; exit 1; }`,
    );
    if (installed.code !== 0) {
      result.code = installed.code;
      result.stderr += `\n${installed.stdout}${installed.stderr}`;
    }
  }
  saveArtifact(
    `${server.name}-install-${version}.log`,
    `${result.stdout}\n--- stderr ---\n${result.stderr}`,
  );
  return result;
}

/** Installs `version` and waits for it to answer. */
export function installOrFail(
  server: Server,
  version: string,
  options?: InstallOptions,
): void {
  const result = install(server, version, options);
  check(result.code === 0, `Thei ${version} installed`);
  waitForHttp(server);
}

/** Submits the setup wizard the way the browser does. */
export function completeWizard(server: Server): void {
  const response = api(server, 'POST', '/api/installation', {
    languageCode: 'en',
    siteAccessLevel: 'public',
    siteUrl: '',
    displayName: 'Bench',
    ...benchCredentials,
  });
  check(
    response.status === 200 && (response.body as any)?.type === 'success',
    'setup wizard completed',
  );
}

/**
 * Puts a copy of a site's `content/` into the instance, the way the backup
 * client's README says to restore one, and waits until the site opens: a
 * copy from an older release is migrated on boot first.
 */
export function restoreSite(server: Server, copy: string): void {
  mustExec(server, 'rm -rf /root/restore');
  copyInto(server, copy, '/root/restore');
  mustExec(
    server,
    `systemctl stop thei
rm -rf /opt/thei/content
mv /root/restore /opt/thei/content
chown -R thei:thei /opt/thei/content
systemctl start thei`,
  );
  waitForSiteOpen(server);
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  text: string;
}

/** Splits what `curl -w '\n%{http_code}'` printed into an answer. */
function parseCurl<T>(stdout: string): ApiResponse<T> {
  const lines = stdout.split('\n');
  const status = Number(lines.pop());
  const text = lines.join('\n');
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: a page, or an empty answer.
  }
  return { status, body: parsed as T, text };
}

/**
 * A request from inside the server: as the admin, through the bench's cookie
 * jar, or as a visitor without one.
 */
export function api<T = any>(
  server: Server,
  method: string,
  path: string,
  body?: unknown,
  options: { visitor?: boolean } = {},
): ApiResponse<T> {
  const data =
    body === undefined
      ? ''
      : `-H 'content-type: application/json' --data-binary @- `;
  const jar = options.visitor ? '' : '-b /root/jar -c /root/jar ';
  const result = run(
    'docker',
    [
      'exec',
      '-i',
      server.name,
      'bash',
      '-c',
      `curl -s -m 60 ${jar}-X ${method} ${data}-w '\\n%{http_code}' ${shellQuote(`http://127.0.0.1:3000${path}`)}`,
    ],
    { input: body === undefined ? '' : JSON.stringify(body) },
  );
  return parseCurl<T>(result.stdout);
}

/**
 * Uploads a file as the asset library's picker does: its bytes as they are,
 * stored as an original.
 */
export function upload<T = any>(server: Server, file: string): ApiResponse<T> {
  const inside = `/root/upload/${basename(file)}`;
  mustExec(server, 'mkdir -p /root/upload');
  copyInto(server, file, inside);
  const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  const settings = encodeURIComponent(JSON.stringify({ type: 'original' }));
  const result = run('docker', [
    ...['exec', server.name, 'curl', '-s', '-m', '120', '-b', '/root/jar'],
    ...['-X', 'POST', '-H', 'content-type: application/octet-stream'],
    ...['-H', `x-upload-extension: ${extension}`],
    ...['-H', `x-upload-settings: ${settings}`],
    ...['--data-binary', `@${inside}`, '-w', '\n%{http_code}'],
    'http://127.0.0.1:3000/api/admin/assets',
  ]);
  return parseCurl<T>(result.stdout);
}

export function waitForHttp(server: Server, path = '/', seconds = 120): void {
  for (let waited = 0; waited < seconds * 2; waited++) {
    const status = api(server, 'GET', path).status;
    if (status > 0 && status !== 502 && status !== 503) return;
    Bun.sleepSync(500);
  }
  throw new BenchFailure(`${server.name} did not answer ${path}.`);
}

/** Waits until the boot, and any update steps it runs, have opened the site. */
export function waitForSiteOpen(server: Server, seconds = 300): void {
  waitForHttp(server, '/api/update/progress');
  let site: unknown;
  for (let waited = 0; waited < seconds; waited++) {
    site = (api(server, 'GET', '/api/update/progress').body as any)?.site;
    if (site === 'open') return;
    if (site === 'failed') break;
    Bun.sleepSync(1000);
  }
  throw new BenchFailure(`${server.name} did not open (${String(site)}).`);
}

/** The paths `/sitemap.xml` lists, as a visitor gets it. */
export function sitemapPaths(server: Server): string[] {
  const sitemap = api(server, 'GET', '/sitemap.xml', undefined, {
    visitor: true,
  });
  check(sitemap.status === 200, 'sitemap.xml answers');
  return [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]!).pathname,
  );
}

export function signIn(server: Server): void {
  // A session left from before is still valid, and a signed-in admin is sent
  // away from the sign-in route: start from an empty jar.
  exec(server, 'rm -f /root/jar');
  const response = api(server, 'POST', '/api/admin/session', benchCredentials);
  check(
    response.status === 200 && (response.body as any)?.type === 'success',
    `signed in to ${server.name}`,
  );
}

export function readJsonFile<T = any>(
  server: Server,
  path: string,
): T | undefined {
  const result = exec(server, `cat '${path}'`);
  if (result.code !== 0) return undefined;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return undefined;
  }
}

/** Single-quoted for bash, whatever the text holds. */
export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function sql(server: Server, query: string): string {
  return mustExec(
    server,
    `sqlite3 -readonly /opt/thei/content/thei.db ${shellQuote(query)}`,
  ).trim();
}

export function tableCounts(server: Server): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of sql(
    server,
    "select name from sqlite_master where type='table' order by name",
  ).split('\n')) {
    if (!table) continue;
    counts[table] = Number(sql(server, `select count(*) from \`${table}\``));
  }
  return counts;
}

export function saveArtifact(name: string, contents: unknown): void {
  writeFileSync(
    join(artifactsDir, name),
    typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2),
  );
}
