import { endBackupSession } from '../../../../thei/backup/session';
import { requireBackupToken } from '../../../../thei/backup/token';
import { readBackupSession } from '../../../../thei/backup/state';

export default defineEventHandler(async (event) => {
  requireBackupToken(event);
  const sessionId = getRouterParam(event, 'sessionId') ?? '';
  const state = await readBackupSession();
  // Abandoning is idempotent on purpose: a client that lost the connection and
  // retries must not be told its own cleanup failed.
  if (state?.sessionId === sessionId) await endBackupSession(sessionId);
  return { released: true };
});
