import { copyFile, mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  BackupKind,
  BackupSessionResponse,
} from '#layers/thei/shared/backup';
import { buildBackupManifest, type BackupManifest } from './manifest';
import {
  backupWorkDir,
  clearBackupSession,
  isAbandonedSession,
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
  const existing = await readBackupSession();
  if (existing && !isAbandonedSession(existing)) {
    throw new BackupBusyError('A backup is already running.');
  }
  if (existing) {
    THEI_SERVER.console
      .tag('Backup')
      .warn(`Reclaiming abandoned session ${existing.sessionId}`);
    manifests.delete(existing.sessionId);
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
    manifests.set(sessionId, manifest);
    await writeBackupSession(state);
    sessionOpen = true;

    THEI_SERVER.console
      .tag('Backup')
      .log(
        `Session ${sessionId} opened: ${manifest.entries.length} file(s), ${manifest.totalBytes} byte(s)`,
      );

    return {
      sessionId,
      startedAt: state.startedAt,
      totalFiles: state.totalFiles,
      totalBytes: state.totalBytes,
      skipped: state.skipped,
    };
  } catch (error) {
    manifests.delete(sessionId);
    await rm(work, { recursive: true, force: true });
    throw error;
  }
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
  return state;
}

export async function backupSessionManifest(
  sessionId: string,
): Promise<BackupManifest> {
  const cached = manifests.get(sessionId);
  if (cached) return cached;
  // The process restarted mid-transfer and lost the in-memory list. Rebuilding
  // is honest here: the snapshot it belongs to is still on disk.
  const manifest = await buildBackupManifest(sessionId);
  manifests.set(sessionId, manifest);
  return manifest;
}

export async function endBackupSession(sessionId: string): Promise<void> {
  manifests.delete(sessionId);
  await clearBackupSession(sessionId);
  sessionOpen = false;
}
