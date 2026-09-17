import {
  BACKUP_MANIFEST_PAGE_SIZE,
  type BackupManifestResponse,
} from '#layers/thei/shared/backup';
import {
  backupSessionManifest,
  requireBackupSession,
} from '../../../../thei/backup/session';
import { requireBackupToken } from '../../../../thei/backup/token';
import {
  sendBackupText,
  wantsBackupText,
} from '../../../../thei/backup/text-format';

export default defineEventHandler(
  async (event): Promise<BackupManifestResponse | string> => {
    requireBackupToken(event);
    const sessionId = getRouterParam(event, 'sessionId') ?? '';
    await requireBackupSession(sessionId);

    const manifest = await backupSessionManifest(sessionId);
    const query = getQuery(event);
    const cursor = Number(query.cursor ?? 0);
    const offset = Number.isSafeInteger(cursor) && cursor > 0 ? cursor : 0;
    const limit = Math.min(
      Math.max(Number(query.limit ?? BACKUP_MANIFEST_PAGE_SIZE) || 0, 1),
      BACKUP_MANIFEST_PAGE_SIZE,
    );

    const entries = manifest.entries.slice(offset, offset + limit);
    const next = offset + entries.length;
    if (wantsBackupText(event)) {
      // `file <size> <path>` rows, then `next <cursor>` while more remain.
      return sendBackupText(event, [
        ...entries.map((entry) => ['file', entry.size, entry.path]),
        ...(next < manifest.entries.length ? [['next', next]] : []),
      ]);
    }
    return {
      entries,
      // Paged rather than sent whole: a library of thousands of files makes a
      // manifest too large to hold comfortably on either side.
      ...(next < manifest.entries.length ? { nextCursor: String(next) } : {}),
    };
  },
);
