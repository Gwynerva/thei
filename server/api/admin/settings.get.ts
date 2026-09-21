import type { SiteSettingsData } from '#layers/thei/shared/profile';
export default defineEventHandler((): SiteSettingsData => ({
  languageCode: THEI_SERVER.config.languageCode,
  siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
  siteUrl: THEI_SERVER.config.siteUrl,
  analytics: THEI_SERVER.config.analytics,
  secretPhrase: THEI_SERVER.config.secretPhrase,
  password: '',
}));
