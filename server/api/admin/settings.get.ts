import type { SiteSettingsData } from '#layers/thei/shared/profile';
export default defineEventHandler((): SiteSettingsData => ({
  languageCode: THEI_SERVER.config.languageCode,
  siteAccessLevel: THEI_SERVER.config.siteAccessLevel,
  secretPhrase: THEI_SERVER.config.secretPhrase,
  password: '',
}));
