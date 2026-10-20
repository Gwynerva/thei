// The lab site and its snapshots: serving it, saving and restoring what it
// holds, and standing the archive in for the playground's own content.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  cachePaths,
  labLoopbackOrigin,
  labOrigin,
  labPort,
  paths,
  repoRoot,
} from '../config';
import type {
  Commands,
  SiteIndex,
  SnapshotManifest,
  StatusLine,
} from '../types';
import { output, parse, portAnswers } from '../util';
import {
  downPlayground,
  playgroundSwapState,
  upPlayground,
} from './playground';
import {
  ownServer,
  startServer,
  stopOwnServer,
  waitUntilReady,
} from './server';
import {
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
  siteAssetsDir,
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
  return existsSync(paths.siteIndex)
    ? JSON.parse(readFileSync(paths.siteIndex, 'utf8'))
    : undefined;
}

/** The snapshot asked for, or the newest this checkout can run. */
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
  const usable = all.find(
    (manifest) => !unknownMigrations(manifest, knownMigrations()).length,
  );
  if (!usable)
    throw new Error(
      all.length
        ? 'Every snapshot ran migrations this checkout does not know: seed one here (bun run lab build).'
        : 'No snapshot yet: bun run lab build (or serve, seed, snapshot save).',
    );
  return usable;
}

export const commands: Commands = {
  serve: {
    summary:
      'Start the lab site (through scripts/dev-server.ts), in this terminal',
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
          writeFileSync(paths.siteIndex, `${JSON.stringify(index, null, 2)}\n`);
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
                const archive =
                  'version' in manifest.archive
                    ? manifest.archive.version
                    : 'conformance';
                return `${manifest.id}  archive ${archive}, seeded ${manifest.seedDay}, ${manifest.assets.length} files${
                  unknown ? `, ${unknown} migration(s) unknown here` : ''
                }`;
              })
            : ['No snapshots yet.'],
        );
        return;
      }
      if (action === 'gc') {
        const keep = Number(values.keep ?? 3);
        const all = listSnapshots();
        const removed = all.slice(keep);
        for (const manifest of removed)
          rmSync(snapshotPaths(manifest.id).dir, {
            recursive: true,
            force: true,
          });
        const kept = new Set(
          all
            .slice(0, keep)
            .flatMap((manifest) => manifest.assets.map((asset) => asset.path)),
        );
        let files = 0;
        const store = siteAssetsDir();
        const visit = (dir: string, prefix: string) => {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) visit(join(dir, entry.name), rel);
            else if (!kept.has(rel)) {
              rmSync(join(dir, entry.name));
              files++;
            }
          }
        };
        visit(store, '');
        console.log(
          `Removed ${removed.length} snapshot(s) and ${files} file(s) no kept snapshot holds.`,
        );
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
            'Its own content waits in .lab/stash/playground; its secrets, AI settings and sign-ins were kept. ' +
            'Access keys of MCP clients work again after bun run lab down playground. Start it with bun run dev.',
        );
        return;
      }
      if (target !== 'lab') throw new Error('up lab, or up playground');
      let restart = false;
      if (await portAnswers(labPort())) {
        if (!values.restart || !ownServer())
          throw new Error(
            `The lab site runs at ${labOrigin()}. Stop it first${ownServer() ? ', or pass --restart' : ': the lab did not start it'}.`,
          );
        await stopOwnServer();
        restart = true;
      }
      const result = restoreSnapshot({ manifest, contentDir: paths.content });
      for (const name of [
        'search.db',
        'search.db-wal',
        'search.db-shm',
        'search.db-journal',
      ])
        rmSync(join(paths.site, '.thei', name), { force: true });
      const index = snapshotPaths(manifest.id).index;
      if (existsSync(index)) {
        const restored = JSON.parse(readFileSync(index, 'utf8')) as SiteIndex;
        restored.snapshotId = manifest.id;
        writeFileSync(
          paths.siteIndex,
          `${JSON.stringify(restored, null, 2)}\n`,
        );
      } else rmSync(paths.siteIndex, { force: true });
      console.log(
        `The lab site holds snapshot ${manifest.id} (${result.files} files${result.copied ? `, ${result.copied} copied` : ''}).`,
      );
      if (values.start || restart) {
        await startServer();
        await waitUntilReady(labLoopbackOrigin(), (message) =>
          console.log(message),
        );
        console.log(`The lab site runs at ${labOrigin()}.`);
      }
    },
  },
  down: {
    summary: 'Give the playground its own content back',
    usage: 'down playground',
    async run(args) {
      const { positionals } = parse(args, {});
      if (positionals[0] !== 'playground') throw new Error('down playground');
      await downPlayground();
      console.log(
        'The playground holds its own content again. Start it with bun run dev.',
      );
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
  const own = ownServer();
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
  const swap = playgroundSwapState();
  if (swap)
    lines.push({
      part: 'site',
      ok: true,
      text: `the playground holds snapshot ${swap.snapshot} since ${swap.swappedAt}`,
    });
  return lines;
}
