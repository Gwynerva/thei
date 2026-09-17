import type { H3Event } from 'h3';

/**
 * A line-oriented alternative to JSON for the backup API.
 *
 * The POSIX backup client runs on bare `bash` and `curl`, where parsing JSON
 * would mean depending on `jq`. With `?format=text` a route answers with one
 * record per line and tab-separated fields instead. Paths in `content/` never
 * contain tabs or newlines: the engine names every file it stores.
 */
export function wantsBackupText(event: H3Event): boolean {
  return getQuery(event).format === 'text';
}

export function sendBackupText(
  event: H3Event,
  rows: (string | number)[][],
): string {
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  setHeader(event, 'Cache-Control', 'no-store');
  return rows.map((fields) => `${fields.join('\t')}\n`).join('');
}
