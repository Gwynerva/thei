import { rotateBackupToken } from '../../../thei/backup/token';

export default defineEventHandler(async () => {
  // Returned once, at generation. The panel shows it and the operator copies
  // it into the backup script; nothing reads it back afterwards.
  return { token: await rotateBackupToken() };
});
