import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFreshDbContext } from '../../server/thei/db/utils';
import { loadLanguage } from '../../shared/language';
import { closeSearchStore } from '../../server/thei/search/indexer';
import { insertRow } from './insert-row';

/**
 * A database of the newest schema in a folder of its own, behind the
 * server's global: its content lives in that folder, and `useDb` reads this
 * database. A test adds to the global whatever else the code it runs reads.
 */
export async function freshTestDb() {
  const directory = await mkdtemp(join(tmpdir(), 'thei-regression-'));
  const language = await loadLanguage('en');
  const server = {
    contentPath: (...parts: string[]) => join(directory, ...parts),
    projectPath: (...parts: string[]) => join(directory, 'project', ...parts),
    language,
    phrase: language.phrase,
  };
  Object.assign(globalThis, { THEI_SERVER: server });
  const db = await createFreshDbContext();
  // Nothing outlives a test: a write need not wait for the disk, nor keep
  // its rollback journal there.
  db.rawDb.pragma('synchronous = OFF');
  db.rawDb.pragma('journal_mode = MEMORY');
  const context = {
    ...db,
    directory,
    server,
    insert(table: string, row: Record<string, unknown>) {
      insertRow(context.rawDb, table, row);
    },
    async close() {
      // The search index, when a test used it, lives in this folder too.
      closeSearchStore();
      context.rawDb.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
  Object.assign(server, { useDb: () => context });
  return context;
}
