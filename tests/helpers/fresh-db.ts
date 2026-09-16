import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFreshDbContext } from '../../server/thei/db/utils';
import { loadLanguage } from '../../shared/language';

export async function freshTestDb() {
  const directory = await mkdtemp(join(tmpdir(), 'thei-regression-'));
  const language = await loadLanguage('en');
  const server = {
    contentPath: (name: string) => join(directory, name),
    language,
    phrase: language.phrase,
  };
  Object.assign(globalThis, { THEI_SERVER: server });
  const context = await createFreshDbContext();
  return {
    ...context,
    directory,
    server,
    async close() {
      context.rawDb.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
