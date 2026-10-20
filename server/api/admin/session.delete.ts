import { destroyCurrentAdminSession } from '../../thei/admin-session';

export default defineEventHandler((event) => {
  destroyCurrentAdminSession(event);
  return sendNoContent(event);
});
