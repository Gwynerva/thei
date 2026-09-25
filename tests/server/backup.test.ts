import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { BACKUP_STALE_AFTER_MS, isBackupStale } from '../../shared/backup';
import {
  THEI_BACKUP_DIRS,
  THEI_BACKUP_FILES,
  THEI_REGENERABLE_DIRS,
  THEI_CONTENT_DIRS,
  unclassifiedContentDirs,
} from '../../server/thei/content-layout';
import { resolveBackupFile } from '../../server/thei/backup/manifest';
import { isAbandonedSession } from '../../server/thei/backup/state';

const CONTENT = join('/srv', 'thei', 'content');
const PROJECT = join('/srv', 'thei');

beforeEach(() => {
  vi.stubGlobal('THEI_SERVER', {
    contentPath: (...parts: string[]) => join(CONTENT, ...parts),
    projectPath: (...parts: string[]) => join(PROJECT, ...parts),
    console: {
      tag: () => ({ log: () => {}, warn: () => {}, error: () => {} }),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('content classification', () => {
  it('classifies every declared directory as backed up or regenerable', () => {
    // Without this, a directory a future release adds silently falls out of
    // every backup — the same failure the layout file prevents for cleanup.
    expect(unclassifiedContentDirs()).toEqual([]);
  });

  it('keeps assets and favicons in backups and the icon cache out of them', () => {
    expect(THEI_BACKUP_DIRS).toContain(THEI_CONTENT_DIRS.assets);
    expect(THEI_BACKUP_DIRS).toContain(THEI_CONTENT_DIRS.externalLinkFavicons);
    expect(THEI_REGENERABLE_DIRS).toContain(THEI_CONTENT_DIRS.generatedMedia);
    expect(THEI_BACKUP_DIRS).not.toContain(THEI_CONTENT_DIRS.generatedMedia);
  });

  it('captures the database and the config', () => {
    expect([...THEI_BACKUP_FILES]).toEqual(['thei.db', 'thei.config.json']);
  });
});

describe('backup path resolution', () => {
  const session = 'session-1';

  it('serves the database and config from the snapshot, not from content', () => {
    // The live database is being written to while a backup runs; its bytes on
    // disk are only a database between writes.
    expect(resolveBackupFile(session, 'thei.db')).toBe(
      join(PROJECT, '.thei', 'backup', session, 'thei.db'),
    );
    expect(resolveBackupFile(session, 'thei.config.json')).toBe(
      join(PROJECT, '.thei', 'backup', session, 'thei.config.json'),
    );
  });

  it('serves asset and favicon files straight from content', () => {
    expect(resolveBackupFile(session, 'assets/ab/abcd.webp')).toBe(
      join(CONTENT, 'assets', 'ab', 'abcd.webp'),
    );
    expect(resolveBackupFile(session, 'external-link-favicons/x.webp')).toBe(
      join(CONTENT, 'external-link-favicons', 'x.webp'),
    );
  });

  it('refuses anything that climbs out of content', () => {
    for (const path of [
      '../thei.config.json',
      'assets/../../secret',
      'assets/./x',
      '/etc/passwd',
      'assets//x',
      '',
      'assets/\0x',
    ]) {
      expect(resolveBackupFile(session, path), path).toBeUndefined();
    }
  });

  it('refuses directories the backup does not cover', () => {
    expect(
      resolveBackupFile(session, 'generated-media/x.avif'),
    ).toBeUndefined();
    expect(resolveBackupFile(session, 'media-sources/x.bin')).toBeUndefined();
  });
});

describe('session reclaim', () => {
  const base = {
    sessionId: 'session-1',
    kind: 'auto' as const,
    startedAt: Date.now(),
    totalFiles: 0,
    totalBytes: 0,
    skipped: [],
  };

  it('keeps a session held by this very process', () => {
    expect(isAbandonedSession({ ...base, pid: process.pid })).toBe(false);
  });

  it('reclaims one held by a process that is gone', () => {
    // A server restarted mid-transfer would otherwise hold the slot forever
    // and no later backup could ever start.
    expect(isAbandonedSession({ ...base, pid: 0x7fffffff })).toBe(true);
  });

  it('reclaims one that outlived its time limit', () => {
    expect(
      isAbandonedSession({
        ...base,
        pid: process.pid,
        startedAt: Date.now() - 7 * 60 * 60 * 1000,
      }),
    ).toBe(true);
  });
});

describe('staleness', () => {
  it('treats a site that has never been backed up as stale', () => {
    expect(isBackupStale(undefined)).toBe(true);
  });

  it('allows a day of slack past the weekly schedule', () => {
    const now = Date.now();
    // At exactly seven days the warning would light up just before nearly
    // every scheduled run.
    expect(isBackupStale(now - 7 * 24 * 60 * 60 * 1000, now)).toBe(false);
    expect(isBackupStale(now - BACKUP_STALE_AFTER_MS - 1, now)).toBe(true);
  });
});
