import { rename, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { languageCodes, loadLanguage } from '#layers/thei/shared/language';
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { SiteSettingsData } from '#layers/thei/shared/profile';
import { generatePasswordData } from '../../thei/password';
import { setTheiConfig } from '../../thei/config';
import { setCurrentLanguage } from '../../thei/language';
import { destroyOtherAdminSessions } from '../../thei/admin-session';

let queue = Promise.resolve();
export default defineEventHandler(async (event) => {
  const input = await readBody<SiteSettingsData>(event);
  if (
    !input ||
    !languageCodes.includes(input.languageCode) ||
    !Object.values(SiteAccessLevel).includes(input.siteAccessLevel) ||
    typeof input.secretPhrase !== 'string' ||
    !input.secretPhrase.trim() ||
    input.secretPhrase.length > 1000 ||
    typeof input.password !== 'string' ||
    input.password.length > 1000
  )
    throw createError({ statusCode: 400, message: 'Invalid settings' });
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
      secretPhrase: input.secretPhrase.trim(),
      password: input.password
        ? generatePasswordData(input.password)
        : THEI_SERVER.config.password,
    };
    const path = THEI_SERVER.contentPath('thei.config.json');
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
    setTheiConfig(config);
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
  return { ...input, secretPhrase: input.secretPhrase.trim(), password: '' };
});
