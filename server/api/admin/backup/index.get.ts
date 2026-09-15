import type { BackupStatus } from '#layers/thei/shared/backup';
import { listBackupRuns } from '../../../thei/backup/repository';
import { backupTokenConfigured } from '../../../thei/backup/token';

export default defineEventHandler((): BackupStatus => {
  const recent = listBackupRuns();
  return {
    // Only whether a token exists. Reading it back would turn every admin page
    // view into another chance to leak it; a lost token is rotated, not shown.
    configured: backupTokenConfigured(),
    ...(recent[0] ? { lastBackup: recent[0] } : {}),
    recent,
  };
});
