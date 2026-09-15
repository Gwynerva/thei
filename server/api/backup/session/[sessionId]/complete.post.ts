import type { BackupRun } from '#layers/thei/shared/backup';
import { recordBackupRun } from '../../../../thei/backup/repository';
import {
  endBackupSession,
  requireBackupSession,
} from '../../../../thei/backup/session';
import { requireBackupToken } from '../../../../thei/backup/token';

export default defineEventHandler(async (event): Promise<BackupRun> => {
  requireBackupToken(event);
  const sessionId = getRouterParam(event, 'sessionId') ?? '';
  const session = await requireBackupSession(sessionId);
  const body = await readBody<{ fileCount?: number; byteCount?: number }>(
    event,
  );

  // The client reports what it actually stored, which is what the panel should
  // show: a run that skipped files reclaimed mid-transfer copied fewer than the
  // manifest listed, and claiming otherwise would hide that.
  const count = (value: unknown, fallback: number) =>
    Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : fallback;

  const run = recordBackupRun({
    kind: session.kind,
    startedAt: session.startedAt,
    fileCount: count(body?.fileCount, session.totalFiles),
    byteCount: count(body?.byteCount, session.totalBytes),
    clientLabel: session.clientLabel,
  });
  await endBackupSession(sessionId);

  THEI_SERVER.console
    .tag('Backup')
    .log(`Session ${sessionId} completed: ${run.fileCount} file(s)`);
  return run;
});
