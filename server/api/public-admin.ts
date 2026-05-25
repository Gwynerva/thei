import { SiteAccessLevel } from '#layers/thei/shared/access-level';

interface PublicAdmin {
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  avatarUrl: string | null;
}

export default defineEventHandler(async (event): Promise<PublicAdmin> => {
  const isPrivateSite =
    THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private;
  const isAdmin = await THEI_SERVER.isAdmin(event);

  if (isPrivateSite && !isAdmin) {
    // Return dummy data
    return {
      siteAccessLevel: SiteAccessLevel.Private,
      displayName: THEI_SERVER.phrase.administrator,
      avatarUrl: null,
    };
  }

  return {
    siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
    displayName: THEI_SERVER.config.displayName,
    avatarUrl: null,
  };
});
