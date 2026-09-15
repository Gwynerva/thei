import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { BackupKind } from '#layers/thei/shared/backup';

/**
 * Completed backup runs, newest kept, oldest trimmed.
 *
 * The instance records these so the admin panel can say when the content was
 * last taken off the machine, and warn when nothing has been for too long.
 */
export const backups = sqliteTable(
  'backups',
  {
    backupUuid: text().primaryKey(),
    kind: text().notNull().$type<BackupKind>(),
    startedAt: integer().notNull(),
    completedAt: integer().notNull(),
    fileCount: integer().notNull(),
    byteCount: integer().notNull(),
    /** Free-form name the client reports, so several machines stay apart. */
    clientLabel: text(),
  },
  (t) => [index('backups-completed-idx').on(t.completedAt)],
);
