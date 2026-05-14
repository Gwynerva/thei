import { isAdminRequest } from '../thei/auth';

interface PublicAdmin {
  globalOpenAccess: boolean;
  displayName: string;
  avatarUrl: string;
}

export default defineEventHandler(async (event): Promise<PublicAdmin> => {
  if (THEI_SERVER.config.globalOpenAccess === false && !isAdminRequest(event)) {
    // Return dummy data to keep even "public" data secured
    return {
      globalOpenAccess: false,
      displayName: THEI_SERVER.phrase('secret_admin'),
      avatarUrl: '/avatar-fallback.webp',
    };
  }

  return {
    globalOpenAccess: THEI_SERVER.config.globalOpenAccess,
    displayName: THEI_SERVER.config.displayName,
    avatarUrl: '/avatar-fallback.webp',
  };
});
