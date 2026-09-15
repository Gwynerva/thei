import { randomUUID } from 'node:crypto';
import { desc, notInArray } from 'drizzle-orm';
import type { BackupKind, BackupRun } from '#layers/thei/shared/backup';

/**
 * How many runs the ledger keeps.
 *
 * The panel shows the last few and warns on staleness; older rows answer no
 * question and would grow without bound on a weekly schedule.
 */
const KEEP_RUNS = 20;

export function recordBackupRun(run: {
  kind: BackupKind;
  startedAt: number;
  fileCount: number;
  byteCount: number;
  clientLabel?: string;
}): BackupRun {
  const { db, schema } = THEI_SERVER.useDb();
  const row = {
    backupUuid: randomUUID(),
    kind: run.kind,
    startedAt: run.startedAt,
    completedAt: Date.now(),
    fileCount: run.fileCount,
    byteCount: run.byteCount,
    clientLabel: run.clientLabel ?? null,
  };
  db.transaction((tx) => {
    tx.insert(schema.backups).values(row).run();
    const keep = tx
      .select({ backupUuid: schema.backups.backupUuid })
      .from(schema.backups)
      .orderBy(desc(schema.backups.completedAt))
      .limit(KEEP_RUNS)
      .all()
      .map((item) => item.backupUuid);
    if (keep.length >= KEEP_RUNS) {
      tx.delete(schema.backups)
        .where(notInArray(schema.backups.backupUuid, keep))
        .run();
    }
  });
  return toRun(row);
}

export function listBackupRuns(limit = 5): BackupRun[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.backups)
    .orderBy(desc(schema.backups.completedAt))
    .limit(limit)
    .all()
    .map(toRun);
}

function toRun(row: {
  backupUuid: string;
  kind: BackupKind;
  startedAt: number;
  completedAt: number;
  fileCount: number;
  byteCount: number;
  clientLabel: string | null;
}): BackupRun {
  return {
    backupUuid: row.backupUuid,
    kind: row.kind,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    fileCount: row.fileCount,
    byteCount: row.byteCount,
    ...(row.clientLabel ? { clientLabel: row.clientLabel } : {}),
  };
}
