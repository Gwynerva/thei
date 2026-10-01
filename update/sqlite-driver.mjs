/**
 * Loads the SQLite driver the way the site will — the `better-sqlite3` the
 * engine depends on, under the Node that runs this file — and opens a database
 * in memory. Exits with 1, saying why, when it cannot.
 *
 * better-sqlite3 carries its own binaries, built for Linux (glibc 2.34 or
 * newer, or musl), macOS and Windows on x64 and arm64, and nothing compiles in
 * their place. A server they do not run on learns it from this check, run by
 * the installer and by the update to 0.0.3 before anything is built, rather
 * than from a site that does not start.
 *
 * Plain JavaScript on purpose: it runs under any Node the installer accepts,
 * with nothing to compile or strip first.
 *
 *   node node_modules/thei/update/sqlite-driver.mjs
 */
import { createRequire } from 'node:module';

try {
  const Database = createRequire(import.meta.url)('better-sqlite3');
  new Database(':memory:').prepare('select 1').get();
} catch (error) {
  console.error(
    `The SQLite driver does not run here (Node ${process.version}, ${process.platform}-${process.arch}): ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
