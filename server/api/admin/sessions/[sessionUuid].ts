import {
  destroyAdminSession,
  memorySessions,
  type AdminSessionData,
} from '#layers/thei/server/thei/admin-session';
import { toPublicAdminSession } from '#layers/thei/server/thei/admin-session/repository/public';

export default defineEventHandler(async (event) => {
  const sessionUuid = getRouterParam(event, 'sessionUuid');
  const currentSession = await THEI_SERVER.getAdmin(event);

  let session: AdminSessionData | undefined;
  for (const memorySession of memorySessions.values()) {
    if (memorySession.sessionUuid === sessionUuid) {
      session = memorySession;
      break;
    }
  }

  if (!session) {
    throw createError({
      statusCode: 404,
      message: 'Session not found',
    });
  }

  switch (event.method) {
    case 'GET': {
      return toPublicAdminSession(session, currentSession?.sessionUuid);
    }
    case 'DELETE': {
      destroyAdminSession(session.token);
      return;
    }
  }
});
