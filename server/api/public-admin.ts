import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { isAdminSession } from '../thei/admin-session';

interface PublicAdmin {
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  avatarUrl: string;
}

export default defineEventHandler(async (event): Promise<PublicAdmin> => {
  const isPrivateSite =
    THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private;
  const isAdmin = await isAdminSession(event);

  if (isPrivateSite && !isAdmin) {
    // Return dummy data
    return {
      siteAccessLevel: SiteAccessLevel.Private,
      displayName: THEI_SERVER.phrase.administrator,
      avatarUrl: '/avatar-fallback.webp',
    };
  }

  return {
    siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
    displayName: THEI_SERVER.config.displayName,
    avatarUrl: '/avatar-fallback.webp',
  };
});
