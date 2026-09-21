import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { LanguageCode } from '#layers/thei/shared/language';
import type { SiteAnalyticsSettings } from '#layers/thei/shared/analytics';
import type { SiteFaviconInfo } from '#layers/thei/shared/profile';
import { resolveFaviconSet } from '../../thei/media/favicon';
import { resolveGeneratedIcon } from '../../thei/media/generated-icon';
import { getProfileIdentity } from '../../thei/profile';

interface PublicAdmin {
  languageCode: LanguageCode;
  siteAccessLevel: SiteAccessLevel;
  displayName: string;
  avatarMedia: MediaDescriptor;
  faviconMedia?: MediaDescriptor;
  favicon?: SiteFaviconInfo;
  /** Present on a public site only; a closed site has no audience to count. */
  analytics?: SiteAnalyticsSettings;
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

  const identity = await getProfileIdentity();
  return {
    languageCode: THEI_SERVER.language.code,
    siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
    displayName: identity.profile.displayName,
    avatarMedia: identity.avatarMedia,
    faviconMedia: identity.faviconMedia,
    favicon: await resolveFaviconInfo(),
    analytics: THEI_SERVER.config.analytics,
  };
});

async function resolveFaviconInfo(): Promise<SiteFaviconInfo> {
  const set = await resolveFaviconSet();
  return { version: set.version, iconExtension: set.iconExtension };
}
