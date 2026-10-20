// The lab site and its snapshots: serving it, saving and restoring what it
// holds, and putting the archive in the playground.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  cachePaths,
  checkouts,
  labLoopbackOrigin,
  labOrigin,
  labPort,
  paths,
  repoRoot,
} from '../config';
import { adapterFingerprint, readLock } from '../archive/source';
import type {
  Commands,
  SiteIndex,
  SnapshotManifest,
  StatusLine,
} from '../types';
import { output, parse, portAnswers, readJsonIf, writeJson } from '../util';
import { playgroundState, upPlayground } from './playground';
import {
  claimPort,
  ownServer,
  startServer,
  stopOwnServer,
  waitUntilReady,
} from './server';
import {
  collectSnapshots,
  listSnapshots,
  referencedSnapshots,
  restoreSnapshot,
  saveSnapshot,
  searchIndexFiles,
  snapshotPaths,
  unknownMigrations,
} from './snapshot';

/**
 * What a database's ledger may hold that this checkout knows: its migrations
 * and its update tasks (`task:<id>`, as `update/migrations/ledger.ts` writes
 * them). Loaded by path: their modules reach into the server, which this
 * folder's type check does not follow.
 */
let known: string[] | undefined;
async function loadKnownMigrations() {
  const load = (path: string) => import(new URL(path, import.meta.url).href);
  const [{ migrationRegistry }, { updateTaskRegistry }] = await Promise.all([
    load('../../../update/migrations/index.ts'),
    load('../../../update/tasks/index.ts'),
  ]);
  known = [
    ...(migrationRegistry as { id: string }[]).map((migration) => migration.id),
    ...(updateTaskRegistry as { id: string }[]).map(
      (task) => `task:${task.id}`,
    ),
  ];
  return known;
}
const knownMigrations = () => {
  if (!known) throw new Error('loadKnownMigrations() first');
  return known;
};

function readIndex(): SiteIndex | undefined {
  return readJsonIf<SiteIndex | undefined>(paths.siteIndex, undefined);
}

const archiveVersion = (manifest: SnapshotManifest) =>
  'version' in manifest.archive ? manifest.archive.version : undefined;

/**
 * The snapshot asked for, or else the newest this checkout can run of the
 * archive release its lock pins — one the adapter here made, when there is
 * one. A snapshot of another release, or of the conformance archive, is
 * taken only when named.
 */
function pickSnapshot(id?: string): SnapshotManifest {
  const all = listSnapshots();
  if (id) {
    const found = all.find((manifest) => manifest.id === id);
    if (!found) throw new Error(`No snapshot ${id}. bun run lab snapshot list`);
    const unknown = unknownMigrations(found, knownMigrations());
    if (unknown.length)
      throw new Error(
        `Snapshot ${id} ran migrations this checkout does not know: ${unknown.join(', ')}`,
      );
    return found;
  }
  const pinned = readLock()?.version;
  const runnable = all.filter(
    (manifest) => !unknownMigrations(manifest, knownMigrations()).length,
  );
  const ofRelease = runnable.filter((manifest) =>
    pinned
      ? archiveVersion(manifest) === pinned
      : archiveVersion(manifest) !== undefined,
  );
  const adapter = adapterFingerprint();
  const chosen =
    ofRelease.find((manifest) => manifest.adapter === adapter) ?? ofRelease[0];
  if (chosen) return chosen;
  const others = runnable.length
    ? ` Snapshots this checkout can run: ${runnable
        .map(
          (manifest) =>
            `${manifest.id} (${archiveVersion(manifest) ?? 'conformance'})`,
        )
        .join(', ')}; name one with --snapshot to take it anyway.`
    : '';
  throw new Error(
    !all.length
      ? 'No snapshot yet: bun run lab build.'
      : !runnable.length
        ? 'Every snapshot ran migrations this checkout does not know: seed one here (bun run lab build).'
        : `No snapshot of archive ${pinned ?? 'release'}${pinned ? ', the release tests/lab/archive.lock.json pins' : ''}: bun run lab build.${others}`,
  );
}

export const commands: Commands = {
  serve: {
    summary:
      'Start the lab site (through scripts/dev-server.ts) in this terminal; up lab --start runs it in the background',
    usage: 'serve [--build]',
    async run(args) {
      const { values } = parse(args, { build: { type: 'boolean' } });
      const result = spawnSync(
        process.execPath,
        ['scripts/dev-server.ts', 'lab', ...(values.build ? ['--build'] : [])],
        { cwd: repoRoot, stdio: 'inherit' },
      );
      return result.status ?? 1;
    },
  },
  snapshot: {
    summary: 'Save, list or collect snapshots of the lab site',
    usage: 'snapshot save|list|gc [--keep <n>] [--json]',
    async run(args) {
      const { values, positionals } = parse(args, {
        json: { type: 'boolean' },
        keep: { type: 'string' },
      });
      const action = positionals[0] ?? 'list';
      await loadKnownMigrations();
      if (action === 'save') {
        if (!existsSync(join(paths.content, 'thei.db')))
          throw new Error('The lab site holds nothing to save yet.');
        const index = readIndex();
        const manifest = saveSnapshot({ contentDir: paths.content, index });
        if (index) {
          index.snapshotId = manifest.id;
          writeJson(paths.siteIndex, index);
        }
        output(values.json ?? false, manifest, () => [
          `Saved snapshot ${manifest.id}: ${manifest.assets.length} files, ${manifest.ledger.length} migrations`,
        ]);
        return;
      }
      if (action === 'list') {
        const all = listSnapshots();
        const known = knownMigrations();
        output(values.json ?? false, all, () =>
          all.length
            ? all.map((manifest) => {
                const unknown = unknownMigrations(manifest, known).length;
                return `${manifest.id}  archive ${archiveVersion(manifest) ?? 'conformance'}, seeded ${manifest.seedDay}, ${manifest.assets.length} files${
                  unknown ? `, ${unknown} migration(s) unknown here` : ''
                }`;
              })
            : ['No snapshots yet.'],
        );
        return;
      }
      if (action === 'gc') {
        // Anything but a whole number would keep none: every snapshot gone,
        // and every file of the cache with them.
        const keep = values.keep ?? '3';
        if (!/^[1-9][0-9]*$/.test(keep))
          throw new Error(
            `--keep is how many snapshots stay: a whole number, at least 1 (not "${keep}").`,
          );
        const result = collectSnapshots({
          keep: Number(keep),
          referenced: referencedSnapshots(checkouts()),
        });
        output(values.json ?? false, result, () => [
          `Removed ${result.removed.length} snapshot(s) and ${result.files} file(s) no kept snapshot holds; kept ${result.kept.join(', ') || 'none'}.`,
        ]);
        return;
      }
      throw new Error(`Unknown snapshot action "${action}": save, list or gc.`);
    },
  },
  up: {
    summary: 'Put a snapshot in place: for the lab site, or as the playground',
    usage: 'up lab|playground [--snapshot <id>] [--start] [--restart]',
    async run(args) {
      const { values, positionals } = parse(args, {
        snapshot: { type: 'string' },
        start: { type: 'boolean' },
        restart: { type: 'boolean' },
      });
      const target = positionals[0];
      await loadKnownMigrations();
      const manifest = pickSnapshot(values.snapshot);
      if (target === 'playground') {
        const result = await upPlayground({ manifest });
        console.log(
          `The playground now holds snapshot ${manifest.id} (${result.files} files${result.copied ? `, ${result.copied} copied` : ''}). ` +
            (result.ownConfig
              ? `Its secrets and AI settings were kept, with ${result.sessions} sign-in(s), ${result.links} sign-in link(s) and ${result.keys} access key(s). `
              : 'It signs in with the words of tests/lab/site/credentials.ts. ') +
            'Start it with bun run dev.',
        );
        return;
      }
      if (target !== 'lab') throw new Error('up lab, or up playground');
      const log = (message: string) => console.log(message);
      let restart = false;
      if ((await claimPort(log)) === 'ours') {
        const own = await ownServer();
        if (!values.restart || !own)
          throw new Error(
            `The lab site runs at ${labOrigin()}. Stop it first${own ? ', or pass --restart' : ': the lab did not start it'}.`,
          );
        await stopOwnServer();
        restart = true;
      }
      const result = restoreSnapshot({ manifest, contentDir: paths.content });
      for (const file of searchIndexFiles(paths.site))
        rmSync(file, { force: true });
      const index = snapshotPaths(manifest.id).index;
      if (existsSync(index)) {
        const restored = readJsonIf<SiteIndex | undefined>(index, undefined)!;
        restored.snapshotId = manifest.id;
        writeJson(paths.siteIndex, restored);
      } else rmSync(paths.siteIndex, { force: true });
      console.log(
        `The lab site holds snapshot ${manifest.id} (${result.files} files${result.copied ? `, ${result.copied} copied` : ''}).`,
      );
      if (values.start || restart) {
        await startServer('dev', undefined, log);
        await waitUntilReady(labLoopbackOrigin(), log);
        console.log(`The lab site runs at ${labOrigin()}.`);
      }
    },
  },
  stop: {
    summary: 'Stop the lab site, when the lab started it',
    usage: 'stop',
    async run() {
      if (!(await stopOwnServer())) {
        console.log(
          (await portAnswers(labPort()))
            ? 'The lab site runs, but the lab did not start it: left as it is.'
            : 'The lab site is not running.',
        );
      }
    },
  },
};

export async function status(): Promise<StatusLine[]> {
  await loadKnownMigrations();
  const lines: StatusLine[] = [];
  const own = await ownServer();
  if (own)
    lines.push({
      part: 'site',
      ok: true,
      text: `started by the lab (PID ${own.pid}, ${own.mode})`,
    });
  const snapshots = listSnapshots();
  const usable = snapshots.filter(
    (manifest) => !unknownMigrations(manifest, knownMigrations()).length,
  );
  lines.push({
    part: 'site',
    ok: usable.length ? true : 'warn',
    text: snapshots.length
      ? `${snapshots.length} snapshot(s) in ${cachePaths().snapshots}, ${usable.length} usable here; newest ${snapshots[0]!.id}`
      : 'no snapshots yet',
  });
  try {
    const chosen = pickSnapshot();
    lines.push({
      part: 'site',
      ok: true,
      text: `lab up takes snapshot ${chosen.id}`,
    });
  } catch (error) {
    if (snapshots.length)
      lines.push({
        part: 'site',
        ok: 'warn',
        text: (error as Error).message,
      });
  }
  const playground = playgroundState();
  if (playground)
    lines.push({
      part: 'site',
      ok: true,
      text: `the playground holds snapshot ${playground.snapshot}, put there ${playground.upAt}`,
    });
  return lines;
}
