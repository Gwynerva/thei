// The few things the lab does to a site's database itself, always with the
// server stopped or through a consistent copy: copy it, read its ledger,
// touch its files, carry admin sessions across.
import { existsSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';

/** A consistent copy of a database, safe while a server writes to it. */
export function copyDatabase(source: string, target: string) {
  rmSync(target, { force: true });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    db.prepare('VACUUM INTO ?').run(target);
  } finally {
    db.close();
  }
}

/** The migrations a database has run, oldest first. */
export function readLedger(path: string): string[] {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return (
      db.prepare('SELECT id FROM _thei_migrations ORDER BY rowid').all() as {
        id: string;
      }[]
    ).map((row) => row.id);
  } finally {
    db.close();
  }
}

/**
 * Every file is touched now: cleanup takes a file no entity holds a day after
 * its last touch, and a snapshot's files were touched when it was saved.
 */
export function touchAssets(path: string) {
  const db = new Database(path, { fileMustExist: true });
  try {
    db.prepare('UPDATE assets SET touchedAt = ?').run(Date.now());
  } finally {
    db.close();
  }
}

interface SessionRow {
  sessionUuid: string;
  data: string;
}

/**
 * Admin sessions of one database written into another: those it lacks, and
 * those it holds an older use of. A person signed in stays signed in.
 */
export function carrySessions(from: string, to: string): number {
  if (!existsSync(from) || !existsSync(to)) return 0;
  const source = new Database(from, { readonly: true, fileMustExist: true });
  const target = new Database(to, { fileMustExist: true });
  try {
    const rows = source
      .prepare('SELECT sessionUuid, data FROM "admin-sessions"')
      .all() as SessionRow[];
    const existing = new Map(
      (
        target
          .prepare('SELECT sessionUuid, data FROM "admin-sessions"')
          .all() as SessionRow[]
      ).map((row) => [row.sessionUuid, row]),
    );
    const lastUsed = (row: SessionRow | undefined) => {
      try {
        return Number(JSON.parse(row?.data ?? '{}').lastUsedAt ?? 0);
      } catch {
        return 0;
      }
    };
    const upsert = target.prepare(
      'INSERT INTO "admin-sessions" (sessionUuid, data) VALUES (?, ?) ON CONFLICT(sessionUuid) DO UPDATE SET data = excluded.data',
    );
    let carried = 0;
    target.transaction(() => {
      for (const row of rows) {
        if (lastUsed(row) <= lastUsed(existing.get(row.sessionUuid))) continue;
        upsert.run(row.sessionUuid, row.data);
        carried++;
      }
    })();
    return carried;
  } finally {
    source.close();
    target.close();
  }
}

/**
 * A rollback journal beside a database belongs to a write that never
 * finished; SQLite replays it into whatever database it finds there.
 */
export function hasHotJournal(contentDir: string): boolean {
  return existsSync(`${contentDir}/thei.db-journal`);
}
