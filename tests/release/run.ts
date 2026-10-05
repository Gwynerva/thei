/**
 * Release bench: installs, updates, backs up and restores Thei in Docker
 * containers that stand in for a real server. See README.md.
 *
 *   bun tests/release/run.ts [scenario…] [--keep] [--full]
 */
import { appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  api,
  artifactsDir,
  BenchFailure,
  buildImage,
  check,
  completeWizard,
  copyRepository,
  exec,
  installOrFail,
  lastRelease,
  log,
  mode,
  must,
  mustExec,
  nextPatch,
  prepareNextRepository,
  prepareRepository,
  readJsonFile,
  removeServer,
  repositories,
  resetArtifacts,
  restoreSite,
  saveArtifact,
  signIn,
  sitemapPaths,
  sql,
  startServer,
  tableCounts,
  versionUnderTest,
  waitForHttp,
  workDir,
  type Server,
} from './bench';
import {
  awaitSeedSite,
  buildSeedSite,
  checkSeedSite,
  seedCopy,
  uploadOrFail,
  writeSampleFiles,
} from './seed';

const keep = process.argv.includes('--keep');

const servers: Server[] = [];
/** The scenario running in this process, which names its package cache. */
let scenarioName = '';

function server(
  name: string,
  port?: number,
  repository = repositories.current,
): Server {
  const started = startServer(`thei-bench-${name}`, scenarioName, port);
  servers.push(started);
  copyRepository(started, repository);
  return started;
}

// ------------------------------------------------------------------ steps

interface UpdateTimelineEntry {
  at: string;
  state?: string;
  steps?: string;
  panel: number;
  progress: number;
  site?: string;
}

/**
 * Follows an update from the outside until it settles, recording what the
 * state file, the admin panel's endpoint and the update screen's endpoint
 * said along the way. Only an outcome reached after `since` counts: right
 * after "try again" the file still holds the failure being retried.
 */
function watchUpdate(target: Server, label: string, since: number): any {
  const timeline: UpdateTimelineEntry[] = [];
  const deadline = Date.now() + 45 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const state = readJsonFile(target, '/opt/thei/.thei/update-state.json');
    const panel = api(target, 'GET', '/api/admin/updates').status;
    const progress = api(target, 'GET', '/api/update/progress');
    const entry: UpdateTimelineEntry = {
      at: new Date().toISOString().slice(11, 19),
      state: state?.status,
      steps: state?.steps
        ?.map((step: any) => `${step.id}=${step.status}`)
        .join(' '),
      panel,
      progress: progress.status,
      site: (progress.body as any)?.site,
    };
    const summary = `${entry.state} panel=${panel} progress=${entry.progress}/${entry.site} ${entry.steps}`;
    if (summary !== last) {
      timeline.push(entry);
      log(`  … ${summary.slice(0, 220)}`);
      last = summary;
    }
    const settled =
      (state?.finishedAt ?? 0) >= since &&
      (state?.status === 'failed' ||
        (state?.status === 'done' && entry.site === 'open'));
    if (settled) {
      saveArtifact(`${target.name}-${label}-timeline.json`, timeline);
      return state;
    }
    Bun.sleepSync(2000);
  }
  saveArtifact(`${target.name}-${label}-timeline.json`, timeline);
  throw new BenchFailure(`The update in ${target.name} did not settle.`);
}

/** The server's own clock, which the state file is written by. */
function containerNow(target: Server): number {
  return Number(mustExec(target, 'date +%s%3N').trim());
}

/** Every page the sitemap lists, and its Markdown twin, answers 200. */
function crawlSitemap(target: Server): void {
  const paths = sitemapPaths(target);
  const failures: string[] = [];
  for (const path of paths) {
    const candidates = [path];
    // Entities — projects with their sections, events, diary days and pages
    // — are served as Markdown too; lists and views are not.
    if (
      /^\/(projects|events|pages|diary)\/[^/]+\/$/.test(path) ||
      /^\/projects\/[^/]+\/sections\/[^/]+\/$/.test(path)
    ) {
      candidates.push(`${path}index.md`);
    }
    for (const candidate of candidates) {
      const status = api(target, 'GET', candidate, undefined, {
        visitor: true,
      }).status;
      if (status !== 200) failures.push(`${status} ${candidate}`);
    }
  }
  saveArtifact(
    `${target.name}-crawl.txt`,
    [...paths, '', ...failures].join('\n'),
  );
  check(
    failures.length === 0,
    `all ${paths.length} sitemap pages answer 200 (${failures.slice(0, 5).join(', ')})`,
  );

  // A card depends on files a build has to carry along; development would
  // draw it whether or not they made it into .output.
  const cards = ['/og/site.png'];
  const entity = paths.find((path) =>
    /^\/(projects|events|pages)\/[^/]+\/$/.test(path),
  );
  const page =
    entity && api(target, 'GET', entity, undefined, { visitor: true });
  const card = page?.text.match(/property="og:image" content="([^"]+)"/)?.[1];
  if (card) cards.push(new URL(card).pathname);
  for (const path of cards) {
    const status = api(target, 'GET', path, undefined, {
      visitor: true,
    }).status;
    check(status === 200, `the Open Graph card ${path} answers ${status}`);
  }
}

function adminPagesOpen(target: Server): void {
  for (const path of [
    '/admin/',
    '/admin/settings/',
    '/admin/updates/',
    '/api/admin/settings',
    '/api/admin/updates',
    '/api/admin/backup',
  ]) {
    const response = api(target, 'GET', path);
    check(response.status === 200, `${path} answers 200 (${response.status})`);
  }
  const settings = api(target, 'GET', '/api/admin/settings').body as any;
  check(
    settings && typeof settings.analytics === 'object',
    'settings carry analytics',
  );
}

/**
 * Puts the backup client the site hands out into the server, with the token
 * filled in the way the settings page does it.
 */
function downloadClient(target: Server, path: string): void {
  const token = (api(target, 'POST', '/api/admin/backup/token').body as any)
    ?.token;
  check(
    typeof token === 'string' && token.length > 0,
    'a backup token was generated',
  );
  const script = api(target, 'GET', '/api/admin/backup/script?platform=unix');
  check(script.status === 200, 'the backup client downloads');
  mustExec(
    target,
    `mkdir -p "$(dirname '${path}')"
cat > '${path}' <<'THEI_BENCH_SCRIPT'
${script.text.replace('__THEI_BACKUP_TOKEN__', token)}
THEI_BENCH_SCRIPT`,
  );
}

/** Runs the client and returns its exit code and output. */
function client(
  target: Server,
  args: string,
  env = '',
): { code: number; out: string } {
  const result = exec(
    target,
    `${env} bash /root/client/thei-backup.sh ${args} 2>&1`,
  );
  appendFileSync(
    join(artifactsDir, `${target.name}-client.log`),
    `\n$ thei-backup.sh ${args} → ${result.code}\n${result.stdout}`,
  );
  log(`  $ thei-backup.sh ${args} → ${result.code}`);
  return { code: result.code, out: result.stdout };
}

/** Edits one key of the client's settings file. */
function setConfig(target: Server, key: string, value: string): void {
  mustExec(
    target,
    `sed -i 's|^${key}=.*|${key}=${value}|' /root/client/thei-backup.conf`,
  );
}

function copies(target: Server, prefix = ''): string[] {
  return exec(target, `ls -1 /backups | grep '^${prefix}' || true`)
    .stdout.split('\n')
    .filter((name) => /^(auto|manual)-/.test(name));
}

// -------------------------------------------------------------- scenarios

/** Scenarios that work on the seed site, and so need the `seed` step. */
const onSeedSite = ['upgrade', 'backup', 'recovery'];

const scenarios: Record<string, () => Promise<void> | void> = {
  /**
   * The site the other scenarios restore: made by the last release through
   * its own API. See seed.ts.
   */
  async seed() {
    await buildSeedSite(server('seed'));
  },

  /**
   * A new site on the version under test. better-sqlite3 carries its
   * binaries: nothing is downloaded or compiled for it, and the build takes
   * along the one this server runs. A better-sqlite3 compiled here against
   * Node 24.19 or later would abort the site whenever the garbage collector
   * freed a statement (nodejs/node#65446).
   */
  async fresh() {
    const target = server('fresh', 3101);
    installOrFail(target, versionUnderTest);
    check(
      exec(target, 'test -e /opt/thei/node_modules/better-sqlite3/build')
        .code !== 0 &&
        exec(target, 'test -e /opt/thei/.cache/node-gyp').code !== 0,
      'better-sqlite3 compiled nothing and downloaded no Node headers',
    );
    check(
      exec(
        target,
        'test -f "/opt/thei/.output/server/node_modules/better-sqlite3/prebuilds/linux-$(node -p process.arch).node"',
      ).code === 0,
      'the build carries its binary for this server',
    );
    check(
      api(target, 'GET', '/', undefined, { visitor: true }).text.includes(
        'install',
      ),
      'a new instance leads to the setup wizard',
    );

    // Opening the wizard must not make a restart forget it is not installed.
    api(target, 'GET', '/install/', undefined, { visitor: true });
    api(target, 'GET', '/favicon/thei/icon.svg', undefined, { visitor: true });
    mustExec(target, 'systemctl restart thei');
    waitForHttp(target);
    const beforeWizard = api(target, 'GET', '/install/', undefined, {
      visitor: true,
    });
    check(
      beforeWizard.status === 200,
      `the wizard survives a restart before it is submitted (${beforeWizard.status})`,
    );

    completeWizard(target);
    signIn(target);
    adminPagesOpen(target);
    // The native parts of media processing set themselves up on install.
    const files = await writeSampleFiles(join(workDir, 'fresh-files'));
    uploadOrFail(target, files.picture, 'a picture');
    const video = uploadOrFail(target, files.video, 'a video');
    check(video.media?.previewSrc, 'the video has a still made by ffmpeg');
    const ledger = Number(sql(target, 'select count(*) from _thei_migrations'));
    check(ledger > 1, `a new database records every step (${ledger})`);

    mustExec(
      target,
      'mkdir -p /opt/thei/.thei && touch /opt/thei/.thei/bench-marker',
    );
    const again = api(
      target,
      'POST',
      '/api/installation/',
      {
        languageCode: 'en',
        siteAccessLevel: 'public',
        siteUrl: '',
        displayName: 'Intruder',
        secretPhrase: 'x',
        password: 'x',
      },
      { visitor: true },
    );
    check(
      again.status >= 400,
      `a second installation is refused (${again.status})`,
    );
    check(
      exec(target, 'test -f /opt/thei/.thei/bench-marker').code === 0,
      '.thei/ survives the refused installation',
    );
    crawlSitemap(target);
  },

  /** The seed site on the last release, updated by that release's own panel. */
  upgrade() {
    const target = server('upgrade', 3100);
    installOrFail(target, lastRelease);
    const site = awaitSeedSite();
    restoreSite(target, seedCopy);
    signIn(target);

    const status = api(target, 'POST', '/api/admin/updates/check').body as any;
    check(
      status?.latestVersion?.replace(/^v/, '') === versionUnderTest,
      `the panel offers ${versionUnderTest} (${status?.latestVersion})`,
    );
    const since = containerNow(target);
    const start = api(target, 'POST', '/api/admin/updates/start').body as any;
    check(start?.type === 'success', 'the update started');

    const state = watchUpdate(target, 'update', since);
    check(
      state.status === 'done',
      `the update finished (${state.status}: ${state.error ?? ''})`,
    );
    check(
      state.steps.every((step: any) => step.status === 'done'),
      'every step is done',
    );
    const running = (api(target, 'GET', '/api/update/progress').body as any)
      ?.version;
    check(
      running === versionUnderTest,
      `the site runs ${versionUnderTest} (${running})`,
    );

    signIn(target);
    checkSeedSite(target, site);
    adminPagesOpen(target);
    crawlSitemap(target);
  },

  /**
   * The backup client against a site on the version under test — the seed
   * site from the last release, restored onto it and migrated on boot — and
   * the copies it makes restored onto another instance.
   */
  backup() {
    const target = server('backup', 3104);
    installOrFail(target, versionUnderTest);
    const site = awaitSeedSite();
    restoreSite(target, seedCopy);
    signIn(target);
    checkSeedSite(target, site);
    adminPagesOpen(target);
    const siteCounts = tableCounts(target);

    downloadClient(target, '/root/client/thei-backup.sh');
    // Settings as the menu would write them.
    mustExec(
      target,
      `cat >> /root/client/thei-backup.conf <<'EOF'
destination=/backups
clientLabel=bench
EOF`,
    );

    // A first copy, complete and intact.
    let run = client(target, '--run');
    check(run.code === 0, `a manual backup succeeds\n${run.out}`);
    const [first] = copies(target, 'manual-');
    check(first, 'the copy is in place');
    const copyDb = `/backups/${first}/thei.db`;
    check(
      mustExec(
        target,
        `sqlite3 -readonly ${copyDb} 'PRAGMA integrity_check'`,
      ).trim() === 'ok',
      'the copied database is intact',
    );
    check(
      Number(
        mustExec(
          target,
          `sqlite3 -readonly ${copyDb} 'select count(*) from projects'`,
        ),
      ) === siteCounts.projects,
      'the copy holds every project',
    );
    const damaged = mustExec(
      target,
      `cd /backups/${first} && find assets -type f | while read f; do n=\${f##*/}; [ "$(sha256sum "$f" | cut -c1-64)" = "\${n%%.*}" ] || echo "$f"; done`,
    ).trim();
    check(damaged === '', `every asset matches its hash ${damaged}`);
    check(
      exec(target, `test -d /backups/${first}/generated-media`).code !== 0,
      'the icon cache is left out',
    );
    check(
      exec(
        target,
        'ls /opt/thei/.thei/backup 2>/dev/null | wc -l',
      ).stdout.trim() === '0',
      'the server keeps no session behind',
    );

    // A second copy shares every unchanged asset with the first.
    run = client(target, '--run');
    check(
      run.code === 0 && /[1-9][0-9]* reused/.test(run.out),
      'a second copy reuses files',
    );
    const [second] = copies(target, 'manual-').filter((name) => name !== first);
    const linked = mustExec(
      target,
      `find /backups/${second}/assets -type f -links 1 | wc -l`,
    ).trim();
    check(
      linked === '0',
      `every asset of the second copy is shared (${linked} not)`,
    );

    // The schedule: not due yet, due half a day early, three copies kept.
    run = client(target, '--run --auto');
    check(
      run.code === 0 && /Not due yet/.test(run.out),
      'a scheduled run waits for its day',
    );
    const dayMs = 24 * 60 * 60 * 1000;
    for (let round = 0; round < 4; round++) {
      setConfig(target, 'lastRunAt', String(Date.now() - 6.6 * dayMs));
      run = client(target, '--run --auto');
      check(
        run.code === 0 && /Scheduled backup complete/.test(run.out),
        `scheduled copy ${round + 1}`,
      );
      Bun.sleepSync(1100);
    }
    check(
      copies(target, 'auto-').length === 3,
      'three scheduled copies are kept',
    );
    check(
      copies(target, 'manual-').length === 2,
      'manual copies are never rotated',
    );

    // The alarm: a site that lost files or entries stops the run. Files
    // are judged by the ones the site uses: totals that fell — cleanup
    // sweeping what nothing used — raise nothing.
    setConfig(target, 'lastFileCount', '100000');
    setConfig(target, 'lastByteCount', '1000000000000');
    run = client(target, '--run');
    check(run.code === 0, 'files nothing used going raises no alarm');
    setConfig(target, 'lastUsedFiles', '100000');
    run = client(target, '--run');
    check(
      run.code === 2 && /SHRANK/.test(run.out),
      'losing most files raises the alarm',
    );
    check(
      exec(target, 'test -f /backups/ALERT.txt').code === 0,
      'the alarm leaves ALERT.txt',
    );
    run = client(target, '--run');
    check(run.code === 2, 'the alarm holds on the next run');
    run = client(target, '--run --force');
    check(run.code === 0, 'backing up anyway accepts the new size');
    check(
      exec(target, 'test -f /backups/ALERT.txt').code !== 0,
      'the alarm is cleared',
    );
    setConfig(
      target,
      'lastCounts',
      'projects:100,events:2,diaryEntries:0,pages:2',
    );
    run = client(target, '--run');
    check(
      run.code === 2 && /projects 100/.test(run.out),
      'losing most projects raises the alarm',
    );
    client(target, '--run --force');

    // A run cut short releases its session: the next one is not refused.
    exec(
      target,
      'timeout -s INT 1 bash /root/client/thei-backup.sh --run >/dev/null 2>&1',
    );
    run = client(target, '--run');
    check(run.code === 0, 'a run right after an interrupted one succeeds');

    // Settings files written on Windows, and hours with a leading zero.
    mustExec(target, "sed -i 's/$/\\r/' /root/client/thei-backup.conf");
    run = client(target, '--run');
    check(run.code === 0, 'a settings file with CRLF line endings works');
    run = client(target, '--install-schedule 08');
    check(run.code === 0, 'the schedule installs');
    check(
      /OnCalendar=\*-\*-\* 08:00:00/.test(
        exec(target, 'cat /etc/systemd/system/thei-backup.timer').stdout,
      ),
      'the timer fires at 08:00',
    );
    check(
      exec(target, 'systemctl is-enabled thei-backup.timer').stdout.trim() ===
        'enabled',
      'the timer is enabled',
    );
    mustExec(target, 'cp /root/client/thei-backup.conf /tmp/site2.conf');
    run = client(
      target,
      '--config site2.conf --install-schedule',
      'cd /tmp &&',
    );
    check(run.code === 0, 'a second site gets a schedule of its own');
    check(
      /--config '\/tmp\/site2\.conf'/.test(
        exec(target, 'cat /etc/systemd/system/thei-backup-site2.service')
          .stdout,
      ),
      'its unit carries the full settings path',
    );
    exec(target, 'systemctl start thei-backup.service');
    check(
      exec(
        target,
        'systemctl show -p Result --value thei-backup.service',
      ).stdout.trim() === 'success',
      'the scheduled unit itself runs',
    );
    client(target, '--remove-schedule');
    client(target, '--config /tmp/site2.conf --remove-schedule');
    check(
      exec(target, 'ls /etc/systemd/system/thei-backup*').code !== 0,
      'both schedules are removed',
    );

    // Only listed paths are handed out, however they are spelled.
    const token = mustExec(
      target,
      "grep '^token=' /root/client/thei-backup.conf | cut -d= -f2 | tr -d '\\r'",
    ).trim();
    const session = mustExec(
      target,
      `curl -s -X POST -H 'x-thei-backup-token: ${token}' -H 'content-type: application/json' --data '{"kind":"manual"}' 'http://127.0.0.1:3000/api/backup/session?format=text' | awk -F'\\t' '$1=="sessionId"{print $2}'`,
    ).trim();
    for (const path of [
      'assets/..%5C..%5C..%5C..%5Cetc%5Cpasswd',
      'assets/..%2F..%2Fthei.config.json',
      'generated-media/x',
    ]) {
      const status = mustExec(
        target,
        `curl -s -o /dev/null -w '%{http_code}' -H 'x-thei-backup-token: ${token}' 'http://127.0.0.1:3000/api/backup/session/${session}/file?path=${path}'`,
      ).trim();
      check(
        status === '400',
        `${decodeURIComponent(path)} is refused (${status})`,
      );
    }
    mustExec(
      target,
      `curl -s -X DELETE -H 'x-thei-backup-token: ${token}' 'http://127.0.0.1:3000/api/backup/session/${session}' >/dev/null`,
    );

    // The client installed on the owner's machine is the last release's.
    mustExec(
      target,
      `mkdir -p /root/old
git -C /srv/thei.git show v${lastRelease}:backup/thei-backup.sh > /root/old/thei-backup.sh
printf 'siteUrl=http://127.0.0.1:3000\\ntoken=${token}\\ndestination=/old-backups\\n' > /root/old/thei-backup.conf`,
    );
    const old = exec(target, 'bash /root/old/thei-backup.sh --run 2>&1');
    check(
      old.code === 0,
      `the ${lastRelease} client still backs up\n${old.stdout.slice(-500)}`,
    );

    // A copy restores onto a new instance, and one missing its assets does
    // not cost the restored site its asset records.
    const restored = server('restored', 3105);
    installOrFail(restored, versionUnderTest);
    const [latest] = copies(target, 'manual-').sort().reverse();
    const local = join(workDir, 'restore-copy');
    must('docker', ['cp', `${target.name}:/backups/${latest}`, local]);
    restoreSite(restored, local);
    rmSync(local, { recursive: true, force: true });
    signIn(restored);
    adminPagesOpen(restored);
    checkSeedSite(restored, site);
    const restoredCounts = tableCounts(restored);
    for (const table of [
      'projects',
      'events',
      'pages',
      'assets',
      'asset-usages',
    ]) {
      check(
        restoredCounts[table] === siteCounts[table],
        `restored ${table}: ${restoredCounts[table]} of ${siteCounts[table]}`,
      );
    }
    mustExec(
      restored,
      'systemctl stop thei && rm -rf /opt/thei/content/assets && systemctl start thei',
    );
    waitForHttp(restored);
    // The first cleanup runs a minute after boot.
    log('  … waiting for the missing-file check');
    let journal = '';
    for (let waited = 0; waited < 180; waited += 5) {
      journal = exec(restored, 'journalctl -u thei --no-pager').stdout;
      if (/stored files are missing/.test(journal)) break;
      Bun.sleepSync(5000);
    }
    check(/stored files are missing/.test(journal), 'the journal says why');
    // Orphaned rows — previews the update replaced — may go as usual; rows
    // still in use must not, for want of a file the restore has yet to copy.
    check(
      !/with missing file/.test(journal),
      'no asset record is dropped for a missing file',
    );
    check(
      Number(
        sql(restored, 'select count(distinct assetUuid) from `asset-usages`'),
      ) ===
        Number(
          sql(target, 'select count(distinct assetUuid) from `asset-usages`'),
        ),
      'every asset in use keeps its record',
    );
  },

  /**
   * The update path the version under test will drive: to a synthetic next
   * release with a phase, a migration, a task and a changed instance
   * template — first failing, then going through.
   */
  async 'next-release'() {
    const next = nextPatch(versionUnderTest);
    const target = server('next', 3102, repositories.next);
    installOrFail(target, versionUnderTest);
    completeWizard(target);
    signIn(target);
    const marker = (name: string) =>
      `sudo -u thei touch /opt/thei/content/.bench-fail-${name} 2>/dev/null || { touch /opt/thei/content/.bench-fail-${name} && chown thei:thei /opt/thei/content/.bench-fail-${name}; }`;

    const status = api(target, 'POST', '/api/admin/updates/check').body as any;
    check(
      status?.latestVersion?.replace(/^v/, '') === next,
      `the panel offers ${next} (${status?.latestVersion})`,
    );

    // A phase that fails stops the update before the build, and leaves the
    // running version's manifest and engine in place.
    mustExec(target, marker('phase'));
    let since = containerNow(target);
    check(
      (api(target, 'POST', '/api/admin/updates/start').body as any)?.type ===
        'success',
      'the update started',
    );
    let state = watchUpdate(target, 'phase-failure', since);
    check(
      state.status === 'failed',
      `a failing phase fails the update (${state.status})`,
    );
    check(
      exec(target, 'grep thei /opt/thei/package.json').stdout.includes(
        `#v${versionUnderTest}"`,
      ),
      'the manifest points at the running version again',
    );
    check(
      exec(
        target,
        'grep \\"version\\" /opt/thei/node_modules/thei/package.json',
      ).stdout.includes(`"${versionUnderTest}"`),
      'the engine in node_modules is the running version again',
    );
    check(
      (api(target, 'GET', '/api/update/progress').body as any)?.version ===
        versionUnderTest,
      'the site keeps running the current version',
    );

    // A migration that fails closes the site with the step named; the admin
    // tries again once the cause is gone.
    mustExec(
      target,
      `rm -f /opt/thei/content/.bench-fail-phase && ${marker('migration')}`,
    );
    since = containerNow(target);
    check(
      (api(target, 'POST', '/api/admin/updates/start').body as any)?.type ===
        'success',
      'the update started again',
    );
    state = watchUpdate(target, 'migration-failure', since);
    const failed = api(target, 'GET', '/api/update/progress').body as any;
    check(
      failed?.site === 'failed' &&
        failed?.failure?.stepId === `migration:${next}/001-bench-migration`,
      `a failing migration keeps the site closed on its step (${failed?.failure?.stepId})`,
    );
    check(failed?.canRetry === true, 'the admin may try again');
    const visitorView = api(target, 'GET', '/', undefined, { visitor: true });
    check(
      visitorView.status === 302 || visitorView.text.includes('update'),
      'visitors are led to the update screen',
    );

    mustExec(target, 'rm -f /opt/thei/content/.bench-fail-migration');
    since = containerNow(target);
    check(
      api(target, 'POST', '/api/update/retry').status === 200,
      'try again is accepted',
    );
    state = watchUpdate(target, 'retry', since);
    check(
      state.status === 'done',
      `the update finishes (${state.status}: ${state.error ?? ''})`,
    );
    const done = api(target, 'GET', '/api/update/progress').body as any;
    check(
      done?.site === 'open' && done?.version === next,
      `the site runs ${next}`,
    );
    check(
      sql(
        target,
        "select count(*) from sqlite_master where name = 'bench-next'",
      ) === '1',
      'the migration ran',
    );
    check(
      sql(
        target,
        `select count(*) from _thei_migrations where id = 'task:${next}/001-bench-task'`,
      ) === '1',
      'the task is recorded',
    );
    check(
      state.steps.some(
        (step: any) =>
          step.id === `phase:${next}/001-bench-phase` && step.status === 'done',
      ),
      'the phase ran',
    );
    check(
      exec(
        target,
        'grep -c "bench release" /opt/thei/package.json',
      ).stdout.trim() === '1',
      'the new instance template was applied',
    );
    signIn(target);
    adminPagesOpen(target);
  },

  /**
   * The way back from an update gone wrong: the installer of the version under
   * test installs the last release, and the site as it was on that release is
   * restored onto it.
   */
  recovery() {
    const target = server('recovery', 3103);
    installOrFail(target, lastRelease, { installerFrom: versionUnderTest });
    const site = awaitSeedSite();
    restoreSite(target, seedCopy);
    signIn(target);
    const status = api(target, 'GET', '/api/admin/updates').body as any;
    check(
      status?.currentVersion === lastRelease,
      `the site runs ${lastRelease} again (${status?.currentVersion})`,
    );
    checkSeedSite(target, site);
    for (const path of ['/', '/admin/', '/api/admin/settings']) {
      const response = api(target, 'GET', path);
      check(
        response.status === 200,
        `${path} answers 200 (${response.status})`,
      );
    }
  },
};

// -------------------------------------------------------------------- main

interface ScenarioResult {
  name: string;
  ok: boolean;
  error?: string;
  seconds: number;
}

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const selected = requested.length ? [...requested] : Object.keys(scenarios);
for (const name of selected) {
  if (!scenarios[name]) {
    console.error(
      `Unknown scenario "${name}". Known: ${Object.keys(scenarios).join(', ')}`,
    );
    process.exit(2);
  }
}
if (
  !selected.includes('seed') &&
  selected.some((name) => onSeedSite.includes(name))
) {
  selected.unshift('seed');
}

/** Runs one scenario in this process; the parent has prepared everything. */
async function runScenario(name: string): Promise<ScenarioResult> {
  scenarioName = name;
  const started = Date.now();
  log(`=== ${name}`);
  try {
    await scenarios[name]!();
    log(`=== ${name}: passed`);
    return { name, ok: true, seconds: (Date.now() - started) / 1000 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`=== ${name}: FAILED\n${message}`);
    return {
      name,
      ok: false,
      error: message,
      seconds: (Date.now() - started) / 1000,
    };
  } finally {
    if (!keep) for (const started of servers.splice(0)) removeServer(started);
  }
}

/** Runs a scenario as a process of its own, so several can run at once. */
async function spawnScenario(name: string): Promise<ScenarioResult> {
  const child = Bun.spawn(
    [
      process.execPath,
      import.meta.path,
      name,
      '--child',
      ...(keep ? ['--keep'] : []),
    ],
    {
      env: { ...process.env, THEI_BENCH_MODE: mode, THEI_BENCH_SCENARIO: name },
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  await child.exited;
  try {
    return JSON.parse(
      await Bun.file(join(artifactsDir, `result-${name}.json`)).text(),
    ) as ScenarioResult;
  } catch {
    return {
      name,
      ok: false,
      error: `The scenario process exited with ${child.exitCode}.`,
      seconds: 0,
    };
  }
}

if (process.argv.includes('--child')) {
  const [name] = requested;
  const result = await runScenario(name!);
  saveArtifact(`result-${name}.json`, result);
  process.exit(result.ok ? 0 : 1);
}

const startedAt = Date.now();
resetArtifacts();
log(
  `Testing the working tree as v${versionUnderTest}, updating from v${lastRelease}`,
);
buildImage();
prepareRepository();
if (selected.includes('next-release')) {
  await prepareNextRepository(versionUnderTest, nextPatch(versionUnderTest));
}
log(
  mode === 'full'
    ? `Running ${selected.join(', ')} one at a time, from a bare server`
    : `Running ${selected.join(', ')} side by side (--full for a bare server, one at a time)`,
);

const results: ScenarioResult[] = [];
if (mode === 'full') {
  for (const name of selected) results.push(await spawnScenario(name));
} else {
  results.push(...(await Promise.all(selected.map(spawnScenario))));
}

saveArtifact('results.json', results);
// A full copy of the repository, which every search of it would turn up.
if (!keep) rmSync(workDir, { recursive: true, force: true });
log(
  [
    ...results.map(
      (result) =>
        `${result.ok ? 'PASS' : 'FAIL'} ${result.name} (${Math.round(result.seconds)}s)` +
        (result.ok ? '' : `\n     ${result.error?.split('\n')[0]}`),
    ),
    `${Math.round((Date.now() - startedAt) / 1000)}s in all`,
  ].join('\n'),
);
process.exit(results.every((result) => result.ok) ? 0 : 1);
