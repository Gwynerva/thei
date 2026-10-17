import { writeFile } from 'node:fs/promises';

/**
 * `thei.config.json` as every release from 0.0.2 to 0.0.5 left it. A site
 * always has one by the time its migrations run; a migration test that starts
 * from a later release's database writes this beside it.
 */
export async function writeSiteConfig_0_0_2(
  contentPath: (...parts: string[]) => string,
) {
  await writeFile(
    contentPath('thei.config.json'),
    JSON.stringify({
      version: '0.0.2',
      languageCode: 'en',
      siteAccessLevel: 'public',
      siteUrl: '',
      analytics: {
        googleTagId: '',
        googleSiteVerification: '',
        yandexMetrikaId: '',
        yandexVerification: '',
      },
      secretPhrase: 'phrase',
      password: { hash: 'h', salt: 's', iterations: 1 },
    }),
  );
}
