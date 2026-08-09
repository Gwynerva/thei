import { destroyCurrentAdminSession } from '../../thei/admin-session';

export default defineEventHandler(async (event) => {
  await destroyCurrentAdminSession(event);
  return sendNoContent(event);
});
