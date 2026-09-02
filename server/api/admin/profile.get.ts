import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { LanguageCode } from '#layers/thei/shared/language';
import { resolveGeneratedIcon } from '../../thei/media/generated-icon';

interface PublicAdmin {
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  avatarMedia: MediaDescriptor;
}

export default defineEventHandler(async (event): Promise<PublicAdmin> => {
  const isPrivateSite =
    THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private;
  const isAdmin = await THEI_SERVER.isAuthenticatedAdmin(event);

  if (isPrivateSite && !isAdmin) {
    // Return dummy data
    return {
      languageCode: THEI_SERVER.language.code,
      siteAccessLevel: SiteAccessLevel.Private,
      displayName: THEI_SERVER.phrase.administrator,
      avatarMedia: resolveGeneratedIcon(
        'author',
        THEI_SERVER.phrase.administrator,
      ),
    };
  }

  return {
    languageCode: THEI_SERVER.language.code,
    siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
    displayName: THEI_SERVER.config.displayName,
    avatarMedia: resolveGeneratedIcon('author', THEI_SERVER.config.displayName),
  };
});
