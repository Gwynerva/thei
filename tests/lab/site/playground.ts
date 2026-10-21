// The archive as the playground's content: `up` puts a snapshot in place of
// `.playground/content`, whatever it held, and the content in place goes. The
// playground's secrets, AI settings, backup token, access keys and sign-ins
// (its sessions and its sign-in links) stay; what the content is comes from
// the snapshot. A checkout's playground starts empty, and the first `up`
// gives it the lab's own words to sign in with (`credentials.ts`).
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config';
import type { SiteIndex, SnapshotManifest } from '../types';
import { portAnswers, readJsonIf, writeJson } from '../util';
import { LAB_CREDENTIALS } from './credentials';
import {
  carryAccessKeys,
  carrySessions,
  carrySignInLinks,
  hasHotJournal,
} from './sqlite';
import { restoreSnapshot, searchIndexFiles, snapshotPaths } from './snapshot';

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

/**
 * The playground's own config, or undefined for an empty playground. A
 * content folder that holds anything but no config has lost it — a restore
 * that never finished, a hand that slipped — and its secrets are not known:
 * giving it the lab's words would replace them, so it is refused.
 */
function ownConfig(content: string): Record<string, unknown> | undefined {
  const file = join(content, 'thei.config.json');
  if (existsSync(file))
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (existsSync(content) && readdirSync(content).length)
    throw new Error(
      `${content} holds content but no thei.config.json: the playground's own secrets are not there to keep. ` +
        'Put its thei.config.json back, or remove the folder to start empty, then try again.',
    );
  return undefined;
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
  /** How a folder is renamed (tests). */
  rename?: (from: string, to: string) => void;
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
  const own = ownConfig(content);
  let sessions = 0;
  let links = 0;
  let keys = 0;
  const result = restoreSnapshot({
    manifest: options.manifest,
    contentDir: content,
    cacheRoot: options.cacheRoot,
    rename: options.rename,
    config: (snapshot) => mergedConfig(snapshot, own),
    beforeSwap: (database) => {
      const held = join(content, 'thei.db');
      sessions = carrySessions(held, database);
      links = carrySignInLinks(held, database);
      keys = carryAccessKeys(held, database);
    },
  });
  // The search index described the content that went, and is built anew.
  for (const file of searchIndexFiles(siteDir)) rmSync(file, { force: true });
  const state: PlaygroundState = {
    snapshot: options.manifest.id,
    upAt: new Date().toISOString(),
  };
  writeJson(options.stateFile ?? paths.playgroundState, state);
  return { ...result, sessions, links, keys, ownConfig: Boolean(own) };
}

/** The snapshot the playground holds, when `lab up playground` put it there. */
export function playgroundState(
  stateFile = paths.playgroundState,
): PlaygroundState | undefined {
  return readJsonIf<PlaygroundState | undefined>(stateFile, undefined);
}

/** What the playground was seeded with: the index of the snapshot it holds. */
export function playgroundIndex(
  stateFile = paths.playgroundState,
): SiteIndex | undefined {
  const state = playgroundState(stateFile);
  return state
    ? readJsonIf<SiteIndex | undefined>(
        snapshotPaths(state.snapshot).index,
        undefined,
      )
    : undefined;
}
