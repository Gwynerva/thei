import { readFile } from 'node:fs/promises';
import { siteRoot } from '../../../thei/site-url';

const SCRIPTS = {
  windows: { file: 'thei-backup.cmd', type: 'application/x-bat' },
  unix: { file: 'thei-backup.sh', type: 'application/x-sh' },
} as const;

/**
 * Hand the operator the client that talks to the backup routes.
 *
 * Served by the engine rather than fetched from anywhere else, so the script
 * and the API it speaks always come from the same release, with this site's
 * address already filled in. The token is not: the server cannot read it back.
 * The settings page fills it in on the client right after generating one.
 *
 * Gated by the admin session like the rest of the panel: the backup token is
 * for the script, not for getting hold of it.
 */
export default defineEventHandler(async (event) => {
  const platform = getQuery(event).platform === 'windows' ? 'windows' : 'unix';
  const script = SCRIPTS[platform];
  let source = (
    await readFile(THEI_SERVER.theiPath('backup', script.file), 'utf8')
  ).replace('__THEI_SITE_URL__', siteRoot(event).replace(/'/g, ''));
  // cmd.exe misreads a batch file with bare LF line endings.
  if (platform === 'windows') source = source.replace(/\r?\n/g, '\r\n');

  setHeader(event, 'Content-Type', `${script.type}; charset=utf-8`);
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="${script.file}"`,
  );
  return source;
});
