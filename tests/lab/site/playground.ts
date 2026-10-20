// The archive as the playground's content: `up` puts a snapshot in place of
// `.playground/content`, whatever it held, and the content in place goes. The
// playground's secrets, AI settings, backup token, access keys and sign-ins
// stay; what the content is comes from the snapshot. A checkout's playground
// starts empty, and the first `up` gives it the lab's own words to sign in
// with (`credentials.ts`).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config';
import type { SnapshotManifest } from '../types';
import { portAnswers } from '../util';
import { LAB_CREDENTIALS } from './credentials';
import { carryAccessKeys, carrySessions, hasHotJournal } from './sqlite';
import { restoreSnapshot } from './snapshot';

export const PLAYGROUND_PORT = 3000;

/** Keys of `thei.config.json` that are the playground's own, kept by `up`. */
export const PLAYGROUND_OWN_KEYS = [
  'secretPhrase',
  'password',
  'backup',
  'mcp',
  'analytics',
  'siteUrl',
] as const;

/**
 * The snapshot's config, with the playground's own keys laid over it. With
 * none of its own, the playground signs in as the lab site does, and the
 * password is written beside its hash, as AGENTS.md reads it.
 */
export function mergedConfig(
  snapshot: Record<string, unknown>,
  playground: Record<string, unknown> | undefined,
) {
  if (!playground)
    return {
      ...snapshot,
      password: {
        ...(snapshot.password as Record<string, unknown>),
        fallback: LAB_CREDENTIALS.password,
      },
    };
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

export interface PlaygroundState {
  snapshot: string;
  upAt: string;
}

export interface UpOptions {
  manifest: SnapshotManifest;
  siteDir?: string;
  stateFile?: string;
  cacheRoot?: string;
  /** Skip the running-server check (tests). */
  assumeStopped?: boolean;
}

export async function upPlayground(options: UpOptions) {
  const siteDir = options.siteDir ?? paths.playground;
  const content = join(siteDir, 'content');
  if (!options.assumeStopped && (await portAnswers(PLAYGROUND_PORT)))
    throw new Error(
      'The playground is running on :3000. Stop it first: the lab never stops a server it did not start.',
    );
  if (hasHotJournal(content))
    throw new Error(
      `${content} holds a thei.db-journal: start the playground once and stop it, then try again.`,
    );
  const configFile = join(content, 'thei.config.json');
  const own = existsSync(configFile)
    ? (JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, unknown>)
    : undefined;
  // The search index describes the content in place, and is built anew.
  for (const file of searchIndexFiles(siteDir)) rmSync(file, { force: true });
  let sessions = 0;
  let keys = 0;
  const result = restoreSnapshot({
    manifest: options.manifest,
    contentDir: content,
    cacheRoot: options.cacheRoot,
    config: (snapshot) => mergedConfig(snapshot, own),
    beforeSwap: (database) => {
      sessions = carrySessions(join(content, 'thei.db'), database);
      keys = carryAccessKeys(join(content, 'thei.db'), database);
    },
  });
  const state: PlaygroundState = {
    snapshot: options.manifest.id,
    upAt: new Date().toISOString(),
  };
  writeFileSync(
    options.stateFile ?? paths.playgroundState,
    `${JSON.stringify(state, null, 2)}\n`,
  );
  return { ...result, sessions, keys, ownConfig: Boolean(own) };
}

/** The snapshot the playground holds, when `lab up playground` put it there. */
export function playgroundState(
  stateFile = paths.playgroundState,
): PlaygroundState | undefined {
  return existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : undefined;
}
