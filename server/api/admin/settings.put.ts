import { languageCodes, loadLanguage } from '#layers/thei/shared/language';
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { SiteSettingsData } from '#layers/thei/shared/profile';
import { normalizeSiteUrl } from '#layers/thei/shared/site-url';
import { generatePasswordData } from '../../thei/password';
import { writeTheiConfig } from '../../thei/config/write';
import { setCurrentLanguage } from '../../thei/language';
import { destroyOtherAdminSessions } from '../../thei/admin-session';

let queue = Promise.resolve();
export default defineEventHandler(async (event) => {
  const input = await readBody<SiteSettingsData>(event);
  if (
    !input ||
    !languageCodes.includes(input.languageCode) ||
    !Object.values(SiteAccessLevel).includes(input.siteAccessLevel) ||
    typeof input.siteUrl !== 'string' ||
    input.siteUrl.length > 1000 ||
    typeof input.secretPhrase !== 'string' ||
    !input.secretPhrase.trim() ||
    input.secretPhrase.length > 1000 ||
    typeof input.password !== 'string' ||
    input.password.length > 1000
  )
    throw createError({ statusCode: 400, message: 'Invalid settings' });
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  if (siteUrl === undefined)
    throw createError({
      statusCode: 400,
      message: THEI_SERVER.phrase.site_url_invalid,
    });
  await loadLanguage(input.languageCode);
  const currentSession =
    input.password ||
    input.secretPhrase.trim() !== THEI_SERVER.config.secretPhrase
      ? await THEI_SERVER.getAdmin(event)
      : undefined;
  const save = queue.then(async () => {
    const previous = THEI_SERVER.config;
    const config = {
      ...previous,
      languageCode: input.languageCode,
      siteAccessLevel: input.siteAccessLevel,
      siteUrl,
      secretPhrase: input.secretPhrase.trim(),
      password: input.password
        ? generatePasswordData(input.password)
        : THEI_SERVER.config.password,
    };
    await writeTheiConfig(config);
    await setCurrentLanguage(config.languageCode);
    if (
      currentSession &&
      (config.secretPhrase !== previous.secretPhrase ||
        config.password.hash !== previous.password.hash)
    )
      await destroyOtherAdminSessions(currentSession.sessionUuid);
  });
  queue = save.catch(() => {});
  await save;
  return {
    ...input,
    siteUrl,
    secretPhrase: input.secretPhrase.trim(),
    password: '',
  };
});
