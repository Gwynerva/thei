import { BACKUP_KINDS, type BackupKind } from '#layers/thei/shared/backup';
import { BackupBusyError, startBackupSession } from '../../thei/backup/session';
import { requireBackupToken } from '../../thei/backup/token';
import { sendBackupText, wantsBackupText } from '../../thei/backup/text-format';

export default defineEventHandler(async (event) => {
  requireBackupToken(event);
  const body = await readBody<{ kind?: string; clientLabel?: string }>(event);
  const kind = body?.kind;
  if (!kind || !BACKUP_KINDS.includes(kind as BackupKind)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid backup kind',
    });
  }
  const clientLabel =
    typeof body?.clientLabel === 'string' && body.clientLabel.trim()
      ? body.clientLabel.trim().slice(0, 100)
      : undefined;

  try {
    const session = await startBackupSession({
      kind: kind as BackupKind,
      clientLabel,
    });
    if (!wantsBackupText(event)) return session;
    return sendBackupText(event, [
      ['sessionId', session.sessionId],
      ['totalFiles', session.totalFiles],
      ['totalBytes', session.totalBytes],
      ...session.skipped.map((name) => ['skipped', name]),
    ]);
  } catch (error) {
    if (error instanceof BackupBusyError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    throw error;
  }
});
