// The archive as the playground's content: `up` puts a snapshot in place of
// `.playground/content` and keeps the playground's own in a stash, `down`
// brings that back. The playground's secrets, AI settings, backup token and
// sign-ins stay; what the content is comes from the snapshot.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config';
import type { SnapshotManifest } from '../types';
import { portAnswers } from '../util';
import { carrySessions, hasHotJournal } from './sqlite';
import { restoreSnapshot, retryRename } from './snapshot';

export const PLAYGROUND_PORT = 3000;

/** Keys of `thei.config.json` that are the playground's own, kept across a swap. */
export const PLAYGROUND_OWN_KEYS = [
  'secretPhrase',
  'password',
  'backup',
  'mcp',
  'analytics',
  'siteUrl',
] as const;

export function stashPaths(root = paths.stash) {
  const dir = join(root, 'playground');
  return {
    dir,
    content: join(dir, 'content'),
    searchIndex: join(dir, 'search'),
    state: join(dir, 'swap.json'),
  };
}

/** The snapshot's config, with the playground's own keys laid over it. */
export function mergedConfig(
  snapshot: Record<string, unknown>,
  playground: Record<string, unknown>,
) {
  const result: Record<string, unknown> = { ...snapshot };
  for (const key of PLAYGROUND_OWN_KEYS)
    if (playground[key] !== undefined) result[key] = playground[key];
    else delete result[key];
  return result;
}

function searchIndexFiles(siteDir: string) {
  const dir = join(siteDir, '.thei');
  return [
    'search.db',
    'search.db-wal',
    'search.db-shm',
    'search.db-journal',
  ].map((name) => join(dir, name));
}

export interface SwapOptions {
  manifest: SnapshotManifest;
  siteDir?: string;
  stashRoot?: string;
  cacheRoot?: string;
  /** Skip the running-server check (tests). */
  assumeStopped?: boolean;
}

export async function upPlayground(options: SwapOptions) {
  const siteDir = options.siteDir ?? paths.playground;
  const content = join(siteDir, 'content');
  const stash = stashPaths(options.stashRoot);
  if (!options.assumeStopped && (await portAnswers(PLAYGROUND_PORT)))
    throw new Error(
      'The playground is running on :3000. Stop it first: the lab never stops a server it did not start.',
    );
  if (existsSync(stash.state))
    throw new Error(
      `The archive already stands in for the playground (${stash.state}). bun run lab down playground first.`,
    );
  if (!existsSync(join(content, 'thei.config.json')))
    throw new Error(
      `${content} holds no thei.config.json: install the playground once before swapping it.`,
    );
  if (hasHotJournal(content))
    throw new Error(
      `${content} holds a thei.db-journal: start the playground once and stop it, then try again.`,
    );
  const own = JSON.parse(
    readFileSync(join(content, 'thei.config.json'), 'utf8'),
  );
  mkdirSync(stash.dir, { recursive: true });
  // The playground's search index is its own, and goes with its content.
  mkdirSync(stash.searchIndex, { recursive: true });
  for (const file of searchIndexFiles(siteDir))
    if (existsSync(file))
      retryRename(file, join(stash.searchIndex, file.split(/[\\/]/).pop()!));
  const result = restoreSnapshot({
    manifest: options.manifest,
    contentDir: content,
    cacheRoot: options.cacheRoot,
    config: (snapshot) => mergedConfig(snapshot, own),
    beforeSwap: (database) => carrySessions(join(content, 'thei.db'), database),
    previousTo: stash.content,
  });
  writeFileSync(
    stash.state,
    `${JSON.stringify({ snapshot: options.manifest.id, swappedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  return result;
}

export async function downPlayground(
  options: {
    siteDir?: string;
    stashRoot?: string;
    keepLabContent?: string;
    assumeStopped?: boolean;
  } = {},
) {
  const siteDir = options.siteDir ?? paths.playground;
  const content = join(siteDir, 'content');
  const stash = stashPaths(options.stashRoot);
  if (!options.assumeStopped && (await portAnswers(PLAYGROUND_PORT)))
    throw new Error('The playground is running on :3000. Stop it first.');
  if (!existsSync(stash.state) || !existsSync(stash.content))
    throw new Error(
      'Nothing to bring back: the playground holds its own content.',
    );
  if (hasHotJournal(content))
    throw new Error(
      `${content} holds a thei.db-journal: start the playground once and stop it, then try again.`,
    );
  // Sign-ins made while the archive stood in go back with the playground.
  carrySessions(join(content, 'thei.db'), join(stash.content, 'thei.db'));
  if (options.keepLabContent) retryRename(content, options.keepLabContent);
  else
    rmSync(content, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    });
  retryRename(stash.content, content);
  for (const file of searchIndexFiles(siteDir)) rmSync(file, { force: true });
  if (existsSync(stash.searchIndex))
    for (const file of searchIndexFiles(siteDir)) {
      const kept = join(stash.searchIndex, file.split(/[\\/]/).pop()!);
      if (existsSync(kept)) retryRename(kept, file);
    }
  rmSync(stash.dir, { recursive: true, force: true });
}

export function playgroundSwapState(
  stashRoot?: string,
): { snapshot: string; swappedAt: string } | undefined {
  const stash = stashPaths(stashRoot);
  return existsSync(stash.state)
    ? JSON.parse(readFileSync(stash.state, 'utf8'))
    : undefined;
}
