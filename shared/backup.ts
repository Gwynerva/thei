/**
 * How a backup run was started.
 *
 * A scheduled run takes one of the rotating slots on the operator's machine; a
 * manual one is named and kept separately. Both reset the weekly clock.
 */
export type BackupKind = 'auto' | 'manual';

export const BACKUP_KINDS: readonly BackupKind[] = ['auto', 'manual'];

/** Header the backup client authenticates with. */
export const BACKUP_TOKEN_HEADER = 'x-thei-backup-token';

/**
 * How long a backup may hold its session before the server reclaims it.
 *
 * A client that dies mid-run would otherwise keep the lock and its database
 * snapshot forever, and the next scheduled run would never start.
 */
export const BACKUP_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How long a session may go without a request or a byte sent before it is
 * reclaimed. A client killed outright never says goodbye; the next run should
 * not wait hours for its slot.
 */
export const BACKUP_SESSION_IDLE_MS = 15 * 60 * 1000;

/** Manifest rows handed out per request. */
export const BACKUP_MANIFEST_PAGE_SIZE = 1000;

/**
 * How stale the last backup may get before the admin panel warns.
 *
 * A day more than the weekly schedule: at exactly seven days the warning would
 * light up just before nearly every scheduled run.
 */
export const BACKUP_STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

export type BackupRun = {
  backupUuid: string;
  kind: BackupKind;
  startedAt: number;
  completedAt: number;
  fileCount: number;
  byteCount: number;
  clientLabel?: string;
};

export type BackupStatus = {
  /** Whether a token has been generated, never the token itself. */
  configured: boolean;
  lastBackup?: BackupRun;
  recent: BackupRun[];
};

export type BackupManifestEntry = {
  /** Path relative to `content/`, always with forward slashes. */
  path: string;
  size: number;
  mtime: number;
};

export type BackupSessionResponse = {
  sessionId: string;
  startedAt: number;
  totalFiles: number;
  totalBytes: number;
  /**
   * The part of the copy the site uses: the database and the config, every
   * stored file placed somewhere, and every link icon a link points at. A
   * client judges a loss by these rather than by the totals: what cleanup
   * sweeps — an original kept a day for the editor, a variant replaced, a
   * file taken out of every text — was in nobody's use, and its going is no
   * loss however large it was. Absent from servers before 0.0.3.
   */
  usedFiles: number;
  usedBytes: number;
  /**
   * Entries found in `content/` that this version does not own, and therefore
   * does not copy. Reported so their absence from a backup is a decision the
   * operator can see rather than a silent omission.
   */
  skipped: string[];
  /**
   * How many of each entity the snapshot holds. A client compares them with
   * the last backup, so a database that lost its content while every file
   * stayed on disk still raises the alarm. Absent from servers before 0.0.2.
   */
  counts?: BackupEntityCounts;
};

export type BackupEntityCounts = Record<BackupCountedEntity, number>;

/** Tables whose shrinking is worth an alarm, by their name on the wire. */
export const BACKUP_COUNTED_TABLES = {
  projects: 'projects',
  events: 'events',
  diaryEntries: 'diary-entries',
  pages: 'pages',
} as const;

export type BackupCountedEntity = keyof typeof BACKUP_COUNTED_TABLES;

export type BackupManifestResponse = {
  entries: BackupManifestEntry[];
  nextCursor?: string;
};

export function isBackupStale(
  lastCompletedAt: number | undefined,
  now = Date.now(),
): boolean {
  if (!lastCompletedAt) return true;
  return now - lastCompletedAt > BACKUP_STALE_AFTER_MS;
}
