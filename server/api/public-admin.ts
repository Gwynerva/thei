import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { resolveGeneratedIcon } from '../thei/media/generated-icon';

interface PublicAdmin {
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  avatarMedia: MediaDescriptor;
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
      avatarMedia: resolveGeneratedIcon(
        'author',
        THEI_SERVER.phrase.administrator,
      ),
    };
  }

  return {
    siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
    displayName: THEI_SERVER.config.displayName,
    avatarMedia: resolveGeneratedIcon('author', THEI_SERVER.config.displayName),
  };
});
