import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomically } from '#layers/thei/update/atomic-file';
import {
  BACKUP_SESSION_IDLE_MS,
  BACKUP_SESSION_TTL_MS,
} from '#layers/thei/shared/backup';
import type { BackupKind } from '#layers/thei/shared/backup';

export type BackupSessionState = {
  sessionId: string;
  kind: BackupKind;
  clientLabel?: string;
  startedAt: number;
  /** The process that opened the session, for stale-run detection. */
  pid: number;
  totalFiles: number;
  totalBytes: number;
  skipped: string[];
};

/**
 * The session file lives beside `content/`, not inside it.
 *
 * It describes a transfer in progress on this machine, not content, and a
 * backup that captured its own bookkeeping would restore a lock nobody holds.
 */
export function backupStatePath(): string {
  return join(THEI_SERVER.projectPath('.thei'), 'backup-state.json');
}

export function backupWorkDir(sessionId: string): string {
  return join(THEI_SERVER.projectPath('.thei'), 'backup', sessionId);
}

/** Writes are serialized so two requests cannot interleave a read and a write. */
let queue: Promise<unknown> = Promise.resolve();

export async function readBackupSession(): Promise<
  BackupSessionState | undefined
> {
  try {
    const raw = await readFile(backupStatePath(), 'utf8');
    return JSON.parse(raw) as BackupSessionState;
  } catch {
    return undefined;
  }
}

export async function writeBackupSession(
  state: BackupSessionState,
): Promise<void> {
  const write = queue.then(() =>
    writeFileAtomically(backupStatePath(), JSON.stringify(state, null, 2)),
  );
  queue = write.catch(() => {});
  await write;
}

export async function clearBackupSession(sessionId?: string): Promise<void> {
  if (sessionId)
    await rm(backupWorkDir(sessionId), { recursive: true, force: true });
  await rm(backupStatePath(), { force: true });
}

/** When each open session last took a request or sent a byte, in memory. */
const lastActivity = new Map<string, number>();

export function touchBackupSession(sessionId: string, now = Date.now()) {
  lastActivity.set(sessionId, now);
}

export function forgetBackupSessionActivity(sessionId: string) {
  lastActivity.delete(sessionId);
}

/**
 * A session nobody can finish any more.
 *
 * Two ways that happens: the server was restarted while a client was pulling,
 * so the recorded process is gone; or the client itself died and left the
 * session open. Either would otherwise hold the slot forever and stop every
 * later backup from starting.
 */
export function isAbandonedSession(
  state: BackupSessionState,
  now = Date.now(),
): boolean {
  if (now - state.startedAt > BACKUP_SESSION_TTL_MS) return true;
  if (state.pid === process.pid) {
    const last = lastActivity.get(state.sessionId) ?? state.startedAt;
    return now - last > BACKUP_SESSION_IDLE_MS;
  }
  try {
    process.kill(state.pid, 0);
    return false;
  } catch {
    return true;
  }
}
