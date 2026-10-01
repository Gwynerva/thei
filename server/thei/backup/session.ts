import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  BACKUP_COUNTED_TABLES,
  type BackupEntityCounts,
  type BackupKind,
  type BackupSessionResponse,
} from '#layers/thei/shared/backup';
import { THEI_BACKUP_FILES } from '../content-layout';
import { externalLinkFaviconPath } from '../external-links/favicon';
import {
  buildBackupManifest,
  contentRelativePath,
  type BackupManifest,
} from './manifest';
import {
  backupWorkDir,
  clearBackupSession,
  forgetBackupSessionActivity,
  isAbandonedSession,
  touchBackupSession,
  readBackupSession,
  writeBackupSession,
  type BackupSessionState,
} from './state';

/**
 * Manifests are held per session rather than rebuilt per page request.
 *
 * Rebuilding would walk the whole asset tree again for every page and, worse,
 * hand out a different list each time — a client paging through would see a
 * set that shifts underneath it.
 */
const manifests = new Map<string, BackupManifest>();
/** The paths each session may hand out: its manifest, and nothing else. */
const allowedPaths = new Map<string, Set<string>>();

function remember(sessionId: string, manifest: BackupManifest) {
  manifests.set(sessionId, manifest);
  allowedPaths.set(
    sessionId,
    new Set(manifest.entries.map((entry) => entry.path)),
  );
}

function forget(sessionId: string) {
  manifests.delete(sessionId);
  allowedPaths.delete(sessionId);
}

/** Set from the first check to the written state, so two starts cannot both pass. */
let opening = false;

/** Set while a session is open, so cleanup can skip its expensive sweep. */
let sessionOpen = false;

export function backupSessionOpen(): boolean {
  return sessionOpen;
}

export class BackupBusyError extends Error {}

/**
 * Open a session and snapshot the database into it.
 *
 * Order matters and is the whole reason this is a session rather than a plain
 * download. The snapshot is taken first; the file list is walked after it. A
 * file that disappears during the transfer is garbage the snapshot either does
 * not reference or references through a row the restored instance will clean
 * up itself, and a file that appears after it is absent from the snapshot too,
 * so both halves stay consistent. Files still live at snapshot time are
 * protected by cleanup's own 24 hour grace period, which is far longer than a
 * transfer.
 */
export async function startBackupSession(options: {
  kind: BackupKind;
  clientLabel?: string;
}): Promise<BackupSessionResponse> {
  if (opening) throw new BackupBusyError('A backup is already starting.');
  opening = true;
  try {
    return await openBackupSession(options);
  } finally {
    opening = false;
  }
}

async function openBackupSession(options: {
  kind: BackupKind;
  clientLabel?: string;
}): Promise<BackupSessionResponse> {
  const existing = await readBackupSession();
  if (existing && !isAbandonedSession(existing)) {
    throw new BackupBusyError('A backup is already running.');
  }
  if (existing) {
    THEI_SERVER.console
      .tag('Backup')
      .warn(`Reclaiming abandoned session ${existing.sessionId}`);
    forget(existing.sessionId);
    await clearBackupSession(existing.sessionId);
  }

  const sessionId = randomUUID();
  const work = backupWorkDir(sessionId);
  await mkdir(work, { recursive: true });

  try {
    // SQLite's own backup API, not a file copy: the live database is being
    // written to, and its bytes on disk are only a database between writes.
    const { rawDb } = THEI_SERVER.useDb();
    await rawDb.backup(join(work, 'thei.db'));
    const counts = countEntities(join(work, 'thei.db'));
    const usedPaths = usedContentPaths(join(work, 'thei.db'));
    await copyFile(
      THEI_SERVER.contentPath('thei.config.json'),
      join(work, 'thei.config.json'),
    );

    const manifest = await buildBackupManifest(sessionId);
    const state: BackupSessionState = {
      sessionId,
      kind: options.kind,
      clientLabel: options.clientLabel,
      startedAt: Date.now(),
      pid: process.pid,
      totalFiles: manifest.entries.length,
      totalBytes: manifest.totalBytes,
      skipped: manifest.skipped,
    };
    // Kept beside the snapshot: a restarted server hands out the same list
    // the client started paging through, not a new walk of the disk.
    await writeFile(manifestPath(sessionId), JSON.stringify(manifest), 'utf8');
    remember(sessionId, manifest);
    await writeBackupSession(state);
    sessionOpen = true;

    THEI_SERVER.console
      .tag('Backup')
      .log(
        `Session ${sessionId} opened: ${manifest.entries.length} file(s), ${manifest.totalBytes} byte(s)`,
      );

    const used = manifest.entries.filter(
      (entry) =>
        (THEI_BACKUP_FILES as readonly string[]).includes(entry.path) ||
        usedPaths.has(entry.path),
    );
    return {
      sessionId,
      startedAt: state.startedAt,
      totalFiles: state.totalFiles,
      totalBytes: state.totalBytes,
      usedFiles: used.length,
      usedBytes: used.reduce((total, entry) => total + entry.size, 0),
      skipped: state.skipped,
      counts,
    };
  } catch (error) {
    forget(sessionId);
    await rm(work, { recursive: true, force: true });
    throw error;
  }
}

/**
 * The files the snapshot's site uses, by the paths a manifest gives them:
 * every stored file placed somewhere on the site, the stills placed on those
 * files, and every icon a link points at. A file no row places — kept a day
 * for the editor, replaced, taken out of every text, or only in a draft or a
 * version — is left to cleanup, and left out here.
 */
function usedContentPaths(snapshotPath: string): Set<string> {
  const snapshot = new Database(snapshotPath, { readonly: true });
  try {
    const placements = snapshot
      .prepare(
        `SELECT a."assetUuid" AS assetUuid, a."contentHash" AS contentHash,
          a."extension" AS extension, u."containerType" AS containerType,
          u."containerId" AS containerId
        FROM "assets" a JOIN "asset-usages" u ON u."assetUuid" = a."assetUuid"`,
      )
      .all() as {
      assetUuid: string;
      contentHash: string;
      extension: string;
      containerType: string;
      containerId: string;
    }[];
    // Placed on the site itself, and then the stills placed on those files.
    const used = new Set(
      placements
        .filter((placement) => placement.containerType !== 'asset')
        .map((placement) => placement.assetUuid),
    );
    for (const placement of placements)
      if (
        placement.containerType === 'asset' &&
        used.has(placement.containerId)
      )
        used.add(placement.assetUuid);
    const paths = new Set<string>();
    for (const placement of placements)
      if (used.has(placement.assetUuid))
        paths.add(
          contentRelativePath(
            THEI_SERVER.assets.filePath(
              placement.contentHash,
              placement.extension,
            ),
          ),
        );
    const icons = snapshot
      .prepare(
        'SELECT DISTINCT "faviconKey" AS faviconKey FROM "external-links"',
      )
      .all() as { faviconKey: string }[];
    for (const { faviconKey } of icons)
      paths.add(contentRelativePath(externalLinkFaviconPath(faviconKey)));
    return paths;
  } finally {
    snapshot.close();
  }
}

/** Entity counts of the snapshot itself, so they match what the copy holds. */
function countEntities(snapshotPath: string): BackupEntityCounts {
  const snapshot = new Database(snapshotPath, { readonly: true });
  try {
    return Object.fromEntries(
      Object.entries(BACKUP_COUNTED_TABLES).map(([entity, table]) => [
        entity,
        (
          snapshot
            .prepare(`SELECT count(*) AS count FROM "${table}"`)
            .get() as {
            count: number;
          }
        ).count,
      ]),
    ) as BackupEntityCounts;
  } finally {
    snapshot.close();
  }
}

function manifestPath(sessionId: string): string {
  return join(backupWorkDir(sessionId), 'manifest.json');
}

/** The open session, or nothing when it was abandoned and has been reclaimed. */
export async function requireBackupSession(
  sessionId: string,
): Promise<BackupSessionState> {
  const state = await readBackupSession();
  if (!state || state.sessionId !== sessionId) {
    throw createError({ statusCode: 404, statusMessage: 'No such session' });
  }
  if (isAbandonedSession(state)) {
    await endBackupSession(sessionId);
    throw createError({ statusCode: 410, statusMessage: 'Session expired' });
  }
  touchBackupSession(sessionId);
  return state;
}

export async function backupSessionManifest(
  sessionId: string,
): Promise<BackupManifest> {
  const cached = manifests.get(sessionId);
  if (cached) return cached;
  // The process restarted mid-transfer and lost the in-memory list; the one
  // written beside the snapshot is the list the client is paging through.
  const manifest = JSON.parse(
    await readFile(manifestPath(sessionId), 'utf8'),
  ) as BackupManifest;
  remember(sessionId, manifest);
  return manifest;
}

/**
 * Whether `path` is a file of the session's manifest. Nothing else is ever
 * handed out, whatever the path looks like once it reaches the disk.
 */
export async function backupSessionHasFile(
  sessionId: string,
  path: string,
): Promise<boolean> {
  await backupSessionManifest(sessionId);
  return allowedPaths.get(sessionId)?.has(path) ?? false;
}

export async function endBackupSession(sessionId: string): Promise<void> {
  forget(sessionId);
  forgetBackupSessionActivity(sessionId);
  await clearBackupSession(sessionId);
  sessionOpen = false;
}
