import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LanguagePhraseId } from '#layers/thei/shared/language/phrases';
import { bootTheiServer } from '../thei/boot/process';
import { generatePasswordData } from '../thei/password';
import { createFreshDbContext } from '../thei/db/utils';

type InstallResponse =
  | { type: 'success'; redirectPath: string }
  | { type: 'error'; phraseId: LanguagePhraseId };

export default defineEventHandler(async (event): Promise<InstallResponse> => {
  const body = await readBody<{
    language?: string;
    isOpenAccess?: boolean;
    displayName?: string;
    authPath?: string;
    password?: string;
  }>(event);

  const language = (body?.language ?? '').trim();
  const isGlobalOpenAccess = body?.isOpenAccess;
  const displayName = (body?.displayName ?? '').trim();
  const authPath = (body?.authPath ?? '').trim();
  const password = body?.password ?? '';

  if (
    !language ||
    isGlobalOpenAccess === undefined ||
    !displayName ||
    !authPath ||
    !password
  ) {
    return {
      type: 'error',
      phraseId: 'install_error_fields_required',
    };
  }

  if (/\s/.test(authPath)) {
    return {
      type: 'error',
      phraseId: 'install_error_auth_path_spaces',
    };
  }

  const passwordData = generatePasswordData(password);

  const configPath = THEI_SERVER.contentPath('thei.config.json');
  await rm(THEI_SERVER.projectPath('.thei'), { force: true, recursive: true });
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        version: THEI_SERVER.version,
        language,
        globalOpenAccess: isGlobalOpenAccess,
        displayName,
        authPath,
        password: {
          hash: passwordData.hash,
          salt: passwordData.salt,
          iterations: passwordData.iterations,
        },
      },
      null,
      2,
    ),
    'utf-8',
  );
  await createFreshDbContext();
  await bootTheiServer();

  return { type: 'success', redirectPath: '/auth/' + authPath };
});
