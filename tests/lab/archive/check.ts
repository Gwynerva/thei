// Reading and checking an archive in one go: what `lab check` prints and
// what the seeder refuses on.
import { localDay } from './dates';
import type { Archive, ArchiveIssue } from './model';
import { readArchive } from './read';
import type { ArchiveSource } from './source';
import { archiveUsage, type UsageLine } from './usage';
import { validateArchive, type Validation } from './validate';

export interface CheckedArchive {
  archive: Archive;
  issues: ArchiveIssue[];
  scans: Validation['scans'];
  usage: UsageLine[];
  /** What a release must use and this archive does not. */
  missing: UsageLine[];
}

export function checkArchive(
  source: ArchiveSource,
  options: { seedDay?: string; media?: boolean } = {},
): CheckedArchive {
  const seedDay = options.seedDay ?? localDay();
  const read = readArchive(source.dir);
  const validation = validateArchive(read.archive, {
    seedDay,
    ...(options.media ? { mediaPath: source.mediaPath } : {}),
  });
  const usage = archiveUsage(read.archive, validation.scans, {
    min: source.kind === 'conformance' ? 1 : 5,
    seedDay,
  });
  return {
    archive: read.archive,
    issues: [...read.issues, ...validation.issues],
    scans: validation.scans,
    usage,
    missing: usage.filter((line) => line.count < line.min),
  };
}
