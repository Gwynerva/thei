import { readFile } from 'node:fs/promises';

/**
 * Hand the operator the client that talks to the backup routes.
 *
 * Served by the engine rather than fetched from anywhere else, so the script
 * and the API it speaks always come from the same release. Gated by the admin
 * session like the rest of the panel: the backup token is for the script, not
 * for getting hold of it.
 */
export default defineEventHandler(async (event) => {
  const source = await readFile(
    THEI_SERVER.theiPath('backup', 'thei-backup.mjs'),
    'utf8',
  );
  setHeader(event, 'Content-Type', 'text/javascript; charset=utf-8');
  setHeader(
    event,
    'Content-Disposition',
    'attachment; filename="thei-backup.mjs"',
  );
  return source;
});
