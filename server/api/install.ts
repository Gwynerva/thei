import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import type { InstallData } from '#layers/thei/shared/api/install';
import { languageCodes } from '#layers/thei/shared/language';
import { generatePasswordData } from '../thei/password';
import { createFreshDbContext } from '../thei/db/utils';
import { bootTheiServer } from '../thei/boot/process';
import type { TheiConfig } from '../thei/config';

type InstallResponse = { type: 'success' } | { type: 'error'; message: string };

export default defineEventHandler(async (event): Promise<InstallResponse> => {
  const body = await readBody<InstallData>(event);
  const installDataOrError = validateInstallData(body);

  if (typeof installDataOrError === 'string') {
    return {
      type: 'error',
      message: installDataOrError,
    };
  }

  const passwordData = generatePasswordData(installDataOrError.password);

  const configPath = THEI_SERVER.contentPath('thei.config.json');
  await rm(THEI_SERVER.projectPath('.thei'), { force: true, recursive: true });
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        version: THEI_SERVER.version,
        languageCode: installDataOrError.languageCode,
        siteAccessLevel: installDataOrError.siteAccessLevel,
        displayName: installDataOrError.displayName,
        secretPhrase: installDataOrError.secretPhrase,
        password: {
          hash: passwordData.hash,
          salt: passwordData.salt,
          iterations: passwordData.iterations,
        },
      } satisfies TheiConfig,
      null,
      2,
    ),
    'utf-8',
  );
  await createFreshDbContext();
  await bootTheiServer();

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
    displayName,
    secretPhrase,
    password,
  };
}
