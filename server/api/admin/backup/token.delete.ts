import { revokeBackupToken } from '../../../thei/backup/token';

export default defineEventHandler(async () => {
  await revokeBackupToken();
  return { configured: false };
});
