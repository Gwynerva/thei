#!/usr/bin/env node
/**
 * Thei backup client.
 *
 * Pulls `content/` off a Thei instance over its backup API and keeps a rotating
 * set of copies on this machine. Deliberately dependency-free: it runs on an
 * operator's laptop or file server, where there is no `node_modules` and no
 * package manager to reach for — only Node itself.
 *
 *   node thei-backup.mjs                 interactive menu
 *   node thei-backup.mjs --run           back up now, as a manual copy
 *   node thei-backup.mjs --run --auto    back up if a week has passed
 *   node thei-backup.mjs --status        print the current state and exit
 *   node thei-backup.mjs --config <path> use a different settings file
 */

import { createWriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const DEFAULT_CONFIG = join(SCRIPT_DIR, 'thei-backup.config.json');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Files fetched at once. Enough to fill a link, few enough to stay polite. */
const PARALLEL_DOWNLOADS = 6;
const MANIFEST_PAGE = 1000;
const AUTO_KEEP = 3;
const TASK_NAME = 'Thei Backup';

const colors = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (colors ? `[${code}m${text}[0m` : text);
const bold = (text) => paint('1', text);
const dim = (text) => paint('2', text);
const red = (text) => paint('31', text);
const green = (text) => paint('32', text);
const yellow = (text) => paint('33', text);

function say(text = '') {
  process.stdout.write(`${text}\n`);
}

function fail(text) {
  process.stderr.write(`${red('!')} ${text}\n`);
}

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function humanAgo(timestamp) {
  if (!timestamp) return 'never';
  const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Sortable, filename-safe, and unambiguous across time zones. */
function stamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------- settings

const EMPTY_CONFIG = {
  siteUrl: '',
  token: '',
  destination: '',
  clientLabel: '',
  lastRunAt: 0,
};

async function readConfig(path) {
  try {
    return { ...EMPTY_CONFIG, ...JSON.parse(await readFile(path, 'utf8')) };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

async function writeConfig(path, config) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

function configComplete(config) {
  return Boolean(config.siteUrl && config.token && config.destination);
}

// --------------------------------------------------------------------- api

async function api(config, path, options = {}) {
  const url = new URL(path, config.siteUrl);
  const response = await fetch(url, {
    ...options,
    headers: {
      'x-thei-backup-token': config.token,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(
      `${options.method ?? 'GET'} ${url.pathname} failed: ${response.status} ${detail.slice(0, 200)}`,
    );
    error.status = response.status;
    throw error;
  }
  return response;
}

async function apiJson(config, path, options) {
  return (await api(config, path, options)).json();
}

// ------------------------------------------------------------------ backup

/**
 * Directories that can supply a file instead of the network.
 *
 * Only ever consulted for `assets/`, whose files are addressed by the hash of
 * their own bytes: a name and size that match cannot be a different file. The
 * database snapshot and the config are excluded on purpose — those change with
 * every run and an old copy of them is simply wrong.
 */
async function reuseSources(destination) {
  const entries = await readdir(destination, { withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^(auto|manual)-/.test(name) || name.startsWith('.tmp-'))
    .sort()
    .reverse()
    .map((name) => join(destination, name));
}

async function reuseFile(sources, entry, target) {
  if (!entry.path.startsWith('assets/')) return false;
  for (const source of sources) {
    const candidate = join(source, ...entry.path.split('/'));
    const info = await stat(candidate).catch(() => null);
    if (!info?.isFile() || info.size !== entry.size) continue;
    await mkdir(dirname(target), { recursive: true });
    // COPYFILE_FICLONE asks the filesystem for a copy-on-write clone and falls
    // back to a real copy where that is not supported.
    await copyFile(candidate, target, fsConstants.COPYFILE_FICLONE);
    return true;
  }
  return false;
}

async function downloadEntry(config, sessionId, entry, target) {
  const part = `${target}.part`;
  await mkdir(dirname(target), { recursive: true });
  const existing = await stat(part).catch(() => null);
  const from = existing && existing.size < entry.size ? existing.size : 0;
  if (existing && existing.size > entry.size) await rm(part, { force: true });

  const query = `?path=${encodeURIComponent(entry.path)}`;
  const response = await api(
    config,
    `/api/backup/session/${sessionId}/file${query}`,
    from ? { headers: { range: `bytes=${from}-` } } : {},
  );
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(part, from ? { flags: 'a' } : {}),
  );
  await rename(part, target);
}

async function fetchManifest(config, sessionId, onPage) {
  let cursor;
  do {
    const query = new URLSearchParams({ limit: String(MANIFEST_PAGE) });
    if (cursor) query.set('cursor', cursor);
    const page = await apiJson(
      config,
      `/api/backup/session/${sessionId}/manifest?${query}`,
    );
    await onPage(page.entries);
    cursor = page.nextCursor;
  } while (cursor);
}

async function pool(items, limit, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (index < items.length) {
        const item = items[index++];
        await worker(item);
      }
    })(),
  );
  await Promise.all(workers);
}

async function performBackup(config, configPath, kind) {
  const destination = resolve(config.destination);
  await mkdir(destination, { recursive: true });

  say(`${dim('·')} Opening a session on ${config.siteUrl}`);
  const session = await apiJson(config, '/api/backup/session', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      clientLabel: config.clientLabel || undefined,
    }),
  });

  if (session.skipped.length) {
    say(
      `${yellow('·')} Not part of a backup, left in place: ${session.skipped.join(', ')}`,
    );
  }
  say(
    `${dim('·')} ${session.totalFiles} file(s), ${humanSize(session.totalBytes)}`,
  );

  const sources = await reuseSources(destination);
  const staging = join(destination, `.tmp-${session.sessionId}`);
  await mkdir(staging, { recursive: true });

  let done = 0;
  let copied = 0;
  let reused = 0;
  let missing = 0;
  let bytes = 0;
  let lastReport = 0;

  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 500) return;
    lastReport = now;
    const percent = session.totalFiles
      ? Math.round((done / session.totalFiles) * 100)
      : 100;
    const line = `  ${percent}%  ${done}/${session.totalFiles}  ${humanSize(bytes)}  ${dim(`reused ${reused}`)}`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}   `);
    else if (force) say(line);
  };

  try {
    await fetchManifest(config, session.sessionId, async (entries) => {
      await pool(entries, PARALLEL_DOWNLOADS, async (entry) => {
        const target = join(staging, ...entry.path.split('/'));
        try {
          if (await reuseFile(sources, entry, target)) reused += 1;
          else {
            await downloadEntry(config, session.sessionId, entry, target);
            copied += 1;
          }
          bytes += entry.size;
        } catch (error) {
          // A file listed at snapshot time can be reclaimed by the server's own
          // cleanup before it is asked for. That is garbage the snapshot does
          // not depend on, so the run continues instead of failing.
          if (error.status === 404) {
            missing += 1;
          } else {
            throw error;
          }
        } finally {
          done += 1;
          report();
        }
      });
    });
    report(true);
    if (process.stdout.isTTY) say();

    const completed = await apiJson(
      config,
      `/api/backup/session/${session.sessionId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          fileCount: copied + reused,
          byteCount: bytes,
        }),
      },
    );

    // Renamed into place only once everything is there: until this line the
    // copy is a `.tmp-` directory nothing will ever mistake for a backup.
    const finalPath = join(
      destination,
      `${kind}-${stamp(new Date(completed.completedAt))}`,
    );
    await rename(staging, finalPath);
    const removed = await rotate(destination);

    config.lastRunAt = completed.completedAt;
    await writeConfig(configPath, config);

    say(
      `${green('✓')} ${kind === 'auto' ? 'Scheduled' : 'Manual'} backup complete: ${copied} downloaded, ${reused} reused${missing ? `, ${missing} vanished` : ''}`,
    );
    say(`  ${finalPath}`);
    if (removed.length) say(dim(`  rotated out: ${removed.join(', ')}`));
    return finalPath;
  } catch (error) {
    // The staging directory is left behind on purpose: the next run reuses
    // every file already in it instead of pulling them again.
    await api(config, `/api/backup/session/${session.sessionId}`, {
      method: 'DELETE',
    }).catch(() => {});
    throw error;
  }
}

/**
 * Keep the newest scheduled copies, and every manual one.
 *
 * Deletion happens after the new copy has been renamed into place, so there is
 * never a moment with fewer than one complete backup on disk.
 */
async function rotate(destination) {
  const entries = await readdir(destination, { withFileTypes: true });
  const autos = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('auto-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const doomed = autos.slice(AUTO_KEEP);
  for (const name of doomed) {
    await rm(join(destination, name), { recursive: true, force: true });
  }
  return doomed;
}

// -------------------------------------------------------------- scheduling

/**
 * The OS task fires daily; this decides whether a run is actually due.
 *
 * Keeping the decision here is what lets a manual backup restart the week
 * without touching the scheduler, and lets a machine that was switched off at
 * the appointed hour still catch up the next time it is on.
 */
function backupDue(config, now = Date.now()) {
  return !config.lastRunAt || now - config.lastRunAt >= WEEK_MS;
}

function taskCommand(configPath) {
  return {
    program: process.execPath,
    args: [SCRIPT_PATH, '--run', '--auto', '--config', configPath],
  };
}

function windowsTaskXml(configPath, hour) {
  const { program, args } = taskCommand(configPath);
  const argumentLine = args
    .map((value) => (value.includes(' ') ? `"${value}"` : value))
    .join(' ');
  const escape = (value) =>
    value.replace(/[&<>"']/g, (character) =>
      character === '&'
        ? '&amp;'
        : character === '<'
          ? '&lt;'
          : character === '>'
            ? '&gt;'
            : character === '"'
              ? '&quot;'
              : '&apos;',
    );
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Weekly Thei content backup.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T${String(hour).padStart(2, '0')}:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <StartWhenAvailable>true</StartWhenAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT12H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escape(program)}</Command>
      <Arguments>${escape(argumentLine)}</Arguments>
      <WorkingDirectory>${escape(SCRIPT_DIR)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

async function installWindowsTask(configPath, hour) {
  // Created from XML rather than plain `schtasks /Create` flags: only the XML
  // form can set StartWhenAvailable, which is what makes a machine that was off
  // at the scheduled time catch up instead of silently skipping the week.
  const directory = await mkdtemp(join(tmpdir(), 'thei-backup-task-'));
  const file = join(directory, 'task.xml');
  try {
    await writeFile(file, windowsTaskXml(configPath, hour), 'utf16le');
    await run('schtasks', ['/Create', '/TN', TASK_NAME, '/XML', file, '/F']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return `Windows Task Scheduler task "${TASK_NAME}" (daily at ${hour}:00, catches up if missed)`;
}

async function removeWindowsTask() {
  await run('schtasks', ['/Delete', '/TN', TASK_NAME, '/F']);
}

function systemdDir() {
  return join(homedir(), '.config', 'systemd', 'user');
}

async function installSystemdTimer(configPath, hour) {
  const { program, args } = taskCommand(configPath);
  const directory = systemdDir();
  await mkdir(directory, { recursive: true });
  const exec = [program, ...args].map((value) => `'${value}'`).join(' ');
  await writeFile(
    join(directory, 'thei-backup.service'),
    `[Unit]\nDescription=Thei content backup\n\n[Service]\nType=oneshot\nExecStart=${exec}\n`,
    'utf8',
  );
  await writeFile(
    join(directory, 'thei-backup.timer'),
    // Persistent=true is the systemd equivalent of StartWhenAvailable: a timer
    // missed because the machine was off runs as soon as it comes back.
    `[Unit]\nDescription=Thei content backup\n\n[Timer]\nOnCalendar=*-*-* ${String(hour).padStart(2, '0')}:00:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`,
    'utf8',
  );
  await run('systemctl', ['--user', 'daemon-reload']);
  await run('systemctl', ['--user', 'enable', '--now', 'thei-backup.timer']);
  return `systemd user timer thei-backup.timer (daily at ${hour}:00, catches up if missed)`;
}

async function readCrontab() {
  try {
    const { stdout } = await run('crontab', ['-l']);
    return stdout;
  } catch {
    return '';
  }
}

async function writeCrontab(content) {
  const directory = await mkdtemp(join(tmpdir(), 'thei-backup-cron-'));
  const file = join(directory, 'crontab');
  try {
    await writeFile(file, content.endsWith('\n') ? content : `${content}\n`);
    await run('crontab', [file]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const CRON_MARK = '# thei-backup';

async function installCron(configPath, hour) {
  const { program, args } = taskCommand(configPath);
  const command = [program, ...args].map((value) => `"${value}"`).join(' ');
  const lines = (await readCrontab())
    .split('\n')
    .filter((line) => !line.includes(CRON_MARK));
  lines.push(`0 ${hour} * * * ${command} ${CRON_MARK}`);
  await writeCrontab(lines.filter(Boolean).join('\n'));
  return `crontab entry (daily at ${hour}:00 — cron cannot catch up a missed run, so the machine has to be on)`;
}

async function removeCron() {
  const lines = (await readCrontab())
    .split('\n')
    .filter((line) => !line.includes(CRON_MARK));
  await writeCrontab(lines.filter(Boolean).join('\n'));
}

async function installSchedule(configPath, hour) {
  if (process.platform === 'win32') return installWindowsTask(configPath, hour);
  try {
    return await installSystemdTimer(configPath, hour);
  } catch {
    return installCron(configPath, hour);
  }
}

async function removeSchedule() {
  if (process.platform === 'win32') {
    await removeWindowsTask();
    return;
  }
  try {
    await run('systemctl', ['--user', 'disable', '--now', 'thei-backup.timer']);
    await rm(join(systemdDir(), 'thei-backup.timer'), { force: true });
    await rm(join(systemdDir(), 'thei-backup.service'), { force: true });
    await run('systemctl', ['--user', 'daemon-reload']).catch(() => {});
  } catch {
    // Nothing to disable; the fallback may still have left a cron line.
  }
  await removeCron().catch(() => {});
}

async function scheduleInstalled() {
  if (process.platform === 'win32') {
    return run('schtasks', ['/Query', '/TN', TASK_NAME]).then(
      () => true,
      () => false,
    );
  }
  const timer = await stat(join(systemdDir(), 'thei-backup.timer')).catch(
    () => null,
  );
  if (timer) return true;
  return (await readCrontab()).includes(CRON_MARK);
}

// ------------------------------------------------------------------ status

async function listBackups(destination) {
  const entries = await readdir(destination, { withFileTypes: true }).catch(
    () => [],
  );
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^(auto|manual)-/.exec(entry.name);
    if (!match) continue;
    result.push({
      name: entry.name,
      kind: match[1],
      bytes: await directorySize(join(destination, entry.name)),
    });
  }
  return result.sort((left, right) => right.name.localeCompare(left.name));
}

async function directorySize(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else {
      const info = await stat(full).catch(() => null);
      total += info?.size ?? 0;
    }
  }
  return total;
}

async function printStatus(config) {
  say();
  say(bold('  State'));
  say(`  Site         ${config.siteUrl || dim('not set')}`);
  say(`  Destination  ${config.destination || dim('not set')}`);
  say(`  Token        ${config.token ? green('set') : dim('not set')}`);
  say(`  Last backup  ${humanAgo(config.lastRunAt)}`);
  say(
    `  Next due     ${backupDue(config) ? yellow('now') : new Date(config.lastRunAt + WEEK_MS).toLocaleString()}`,
  );
  say(
    `  Schedule     ${(await scheduleInstalled()) ? green('installed') : dim('not installed')}`,
  );

  if (!config.destination) return;
  const backups = await listBackups(resolve(config.destination));
  say();
  if (!backups.length) {
    say(dim('  No copies yet.'));
    return;
  }
  const manual = backups.filter((item) => item.kind === 'manual');
  say(bold('  Copies'));
  for (const item of backups) {
    say(`  ${item.name.padEnd(30)} ${humanSize(item.bytes).padStart(10)}`);
  }
  if (manual.length) {
    const held = manual.reduce((total, item) => total + item.bytes, 0);
    say(
      dim(
        `  ${manual.length} manual cop${manual.length === 1 ? 'y' : 'ies'} holding ${humanSize(held)} — these are never rotated out.`,
      ),
    );
  }
}

function printRestore(config) {
  const example = config.destination
    ? join(resolve(config.destination), 'auto-<timestamp>')
    : '/path/to/backup/auto-<timestamp>';
  say();
  say(bold('  Restoring a copy'));
  say('  On the server, as root:');
  say();
  say(dim('    systemctl stop thei'));
  say(dim('    mv /opt/thei/content /opt/thei/content.broken'));
  say(dim(`    cp -a ${example} /opt/thei/content`));
  say(dim('    chown -R thei:thei /opt/thei/content'));
  say(dim('    systemctl start thei'));
  say();
  say('  Three things worth knowing:');
  say(
    '  1. The service runs as the `thei` user. A copy unpacked as root will not',
  );
  say('     be writable without the chown.');
  say(
    '  2. Restore onto the same engine version or a newer one. A newer engine',
  );
  say('     migrates the content on boot; an older one refuses to open it.');
  say('  3. `generated-media/` and `external-link-favicons/` are missing on');
  say(
    '     purpose. They are caches, and the site rebuilds them on first use.',
  );
  say();
  say(
    dim(
      '  A minute after startup the engine reconciles the database against the',
    ),
  );
  say(dim('  files on disk. That is part of a restore, not a fault.'));
}

// -------------------------------------------------------------------- menu

async function configure(rl, config, configPath) {
  const ask = async (label, current) => {
    const answer = (
      await rl.question(`  ${label}${current ? dim(` [${current}]`) : ''}: `)
    ).trim();
    return answer || current;
  };
  say();
  config.siteUrl = await ask(
    'Site address (https://example.com)',
    config.siteUrl,
  );
  config.token = await ask('Backup token', config.token);
  config.destination = await ask('Destination folder', config.destination);
  config.clientLabel = await ask(
    'Name for this machine (optional)',
    config.clientLabel,
  );
  await writeConfig(configPath, config);
  say(`${green('✓')} Saved to ${configPath}`);
}

async function askHour(rl) {
  const answer = (await rl.question('  Hour of day, 0-23 [3]: ')).trim();
  const hour = answer ? Number(answer) : 3;
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 3;
}

async function menu(config, configPath) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      say();
      say(bold('  Thei backup'));
      say('  1  Back up now (manual copy, kept forever)');
      say('  2  Settings (site, token, destination)');
      say('  3  Weekly schedule: install or remove');
      say('  4  State and copies');
      say('  5  How to restore');
      say('  6  Quit');
      const choice = (await rl.question('  > ')).trim();

      try {
        if (choice === '1') {
          if (!configComplete(config)) {
            fail('Set the site, token and destination first (option 2).');
            continue;
          }
          await performBackup(config, configPath, 'manual');
        } else if (choice === '2') {
          await configure(rl, config, configPath);
        } else if (choice === '3') {
          if ((await scheduleInstalled()) === true) {
            const yes = (
              await rl.question('  A schedule exists. Remove it? [y/N]: ')
            )
              .trim()
              .toLowerCase();
            if (yes === 'y') {
              await removeSchedule();
              say(`${green('✓')} Schedule removed.`);
            }
            continue;
          }
          if (!configComplete(config)) {
            fail('Set the site, token and destination first (option 2).');
            continue;
          }
          say();
          say(
            dim(
              '  The task runs daily and backs up only when a week has passed,',
            ),
          );
          say(
            dim(
              '  so a machine that was off still catches up and a manual backup',
            ),
          );
          say(dim('  restarts the week on its own.'));
          const described = await installSchedule(
            configPath,
            await askHour(rl),
          );
          say(`${green('✓')} Installed: ${described}`);
        } else if (choice === '4') {
          await printStatus(config);
        } else if (choice === '5') {
          printRestore(config);
        } else if (choice === '6' || choice === '') {
          return;
        }
      } catch (error) {
        fail(error.message);
      }
    }
  } finally {
    rl.close();
  }
}

// -------------------------------------------------------------------- main

function parseArgs(argv) {
  const flags = new Set();
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--config') configPath = resolve(argv[++index] ?? '');
    else flags.add(value);
  }
  return { flags, configPath };
}

async function main() {
  const { flags, configPath } = parseArgs(process.argv.slice(2));
  const config = await readConfig(configPath);

  if (flags.has('--status')) {
    await printStatus(config);
    return;
  }

  if (flags.has('--run')) {
    if (!configComplete(config)) {
      fail(
        `Nothing configured in ${configPath}. Run without --run to set it up.`,
      );
      process.exitCode = 1;
      return;
    }
    const auto = flags.has('--auto');
    if (auto && !backupDue(config)) {
      say(dim(`Not due yet; last backup ${humanAgo(config.lastRunAt)}.`));
      return;
    }
    try {
      await performBackup(config, configPath, auto ? 'auto' : 'manual');
    } catch (error) {
      fail(error.message);
      process.exitCode = 1;
    }
    return;
  }

  await menu(config, configPath);
}

await main();
