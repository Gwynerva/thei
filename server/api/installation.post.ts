import { mkdir, rm } from 'node:fs/promises';
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { InstallData } from '#layers/thei/shared/api/install';
import { languageCodes } from '#layers/thei/shared/language';
import { normalizeSiteUrl } from '#layers/thei/shared/site-url';
import { emptySiteAnalytics } from '#layers/thei/shared/analytics';
import { writeConfigFile } from '#layers/thei/update/config-file';
import { generatePasswordData } from '../thei/password';
import { createFreshDbContext } from '../thei/db/utils';
import { setAsideOrphanDatabase } from '../thei/db/orphan';
import { bootTheiServer } from '../thei/boot/process';
import { bootResult } from '../thei/boot/result';
import type { TheiConfig } from '../thei/config';

type InstallResponse = { type: 'success' } | { type: 'error'; message: string };

/** One installation at a time: a second click must not race the first. */
let installing = false;

export default defineEventHandler(async (event): Promise<InstallResponse> => {
  // The middleware sends every other request of an installed site elsewhere,
  // but a route is also reachable by spellings it does not compare, such as
  // a trailing slash. The handler guards itself.
  if (bootResult.type !== 'install' || installing) {
    throw createError({ statusCode: 409, statusMessage: 'Already installed' });
  }

  const body = await readBody<InstallData | undefined>(event);
  const installDataOrError = validateInstallData(body ?? ({} as InstallData));

  if (typeof installDataOrError === 'string') {
    return {
      type: 'error',
      message: installDataOrError,
    };
  }

  installing = true;
  try {
    const passwordData = generatePasswordData(installDataOrError.password);

    await rm(THEI_SERVER.projectPath('.thei'), {
      force: true,
      recursive: true,
    });
    await mkdir(THEI_SERVER.contentPath(), { recursive: true });
    // Left by an attempt that failed before writing the config.
    await setAsideOrphanDatabase();
    const fresh = await createFreshDbContext();
    try {
      fresh.db
        .insert(fresh.schema.profiles)
        .values({
          profileId: 'profile',
          displayName: installDataOrError.displayName,
        })
        .run();
    } finally {
      fresh.rawDb.close();
    }

    // Written last, and atomically: its presence is what makes the site
    // installed.
    await writeConfigFile(THEI_SERVER.contentPath('thei.config.json'), {
      version: THEI_SERVER.version,
      languageCode: installDataOrError.languageCode,
      siteAccessLevel: installDataOrError.siteAccessLevel,
      siteUrl: installDataOrError.siteUrl,
      analytics: emptySiteAnalytics,
      secretPhrase: installDataOrError.secretPhrase,
      password: {
        hash: passwordData.hash,
        salt: passwordData.salt,
        iterations: passwordData.iterations,
      },
    } satisfies TheiConfig);
    await bootTheiServer();
  } finally {
    installing = false;
  }

  return { type: 'success' };
});

function validateInstallData(data: InstallData): string | InstallData {
  const languageCode = data.languageCode?.trim();
  if (!isOneOf(languageCode, languageCodes)) {
    return `Unknown language code "${languageCode}"!`;
  }

  const siteAccessLevel = data.siteAccessLevel?.trim();
  if (!isOneOf(siteAccessLevel, SiteAccessLevel)) {
    return `Unknown site access level "${siteAccessLevel}"!`;
  }

  const siteUrl = normalizeSiteUrl(data.siteUrl ?? '');
  if (siteUrl === undefined) {
    return `Unusable site address "${data.siteUrl}"!`;
  }

  const displayName = data.displayName?.trim();
  if (!displayName) {
    return 'Display name can not be empty!';
  }

  const secretPhrase = data.secretPhrase?.trim();
  if (!secretPhrase) {
    return 'Secret phrase can not be empty!';
  }

  const password = data.password?.trim();
  if (!password) {
    return 'Password can not be empty!';
  }

  return {
    languageCode,
    siteAccessLevel,
    siteUrl,
    displayName,
    secretPhrase,
    password,
  };
}
