// The archive adapter: reads the archive (FORMAT.md of thei-lab-archive),
// fetches its releases into the shared cache, and seeds a site through the
// admin's own routes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { labLoopbackOrigin, labOrigin, paths } from '../config';
import { requireOwnSite } from '../site/server';
import type { Commands, SiteIndex, StatusLine } from '../types';
import { output, parse } from '../util';
import { fetchRelease } from './fetch';
import { checkArchive } from './check';
import { localDay } from './dates';
import { seedSite } from './seed';
import { adapterFingerprint, archiveSource, readLock } from './source';

export const commands: Commands = {
  fetch: {
    summary: 'Download the pinned archive release into the shared cache',
    usage: 'fetch [--packs all|none] [--json]',
    async run(args) {
      const { values } = parse(args, {
        packs: { type: 'string' },
        json: { type: 'boolean' },
      });
      const lock = readLock();
      if (!lock)
        throw new Error(
          'No archive release is pinned yet (tests/lab/archive.lock.json).',
        );
      const started = Date.now();
      const result = await fetchRelease(lock, {
        packs: values.packs === 'none' ? 'none' : 'all',
        log: values.json ? () => {} : (message) => console.log(message),
      });
      output(
        values.json ?? false,
        {
          version: lock.version,
          downloaded: result.downloaded,
          blobs: result.blobs,
        },
        () => [
          `Archive ${lock.version}: ${Object.keys(result.release.files).length} files; ` +
            `${result.downloaded.length ? `downloaded ${result.downloaded.join(', ')}` : 'everything was in the cache already'} ` +
            `(${Math.round((Date.now() - started) / 1000)} s)`,
        ],
      );
    },
  },
  check: {
    summary: 'Validate an archive offline and show what of Thei it covers',
    usage:
      'check [--archive <dir>|conformance] [--media] [--today YYYY-MM-DD] [--json]',
    async run(args) {
      const { values } = parse(args, {
        archive: { type: 'string' },
        media: { type: 'boolean' },
        today: { type: 'string' },
        json: { type: 'boolean' },
      });
      const source = archiveSource(values.archive);
      const checked = checkArchive(source, {
        media: values.media,
        seedDay: values.today,
      });
      const errors = checked.issues.filter((issue) => issue.level === 'error');
      const { archive } = checked;
      output(
        values.json ?? false,
        {
          source: source.label,
          issues: checked.issues,
          usage: checked.usage,
          missing: checked.missing,
        },
        () => [
          `${source.label}: ${archive.meta.title || '(no title)'} ${archive.meta.version}`,
          `  ${archive.projects.length} projects (${archive.projects.reduce((n, p) => n + p.sections.length, 0)} sections), ` +
            `${archive.events.length} events, ${archive.diary.length} diary entries, ${archive.pages.length} pages, ` +
            `${archive.tags.length} tags, ${archive.files.length} files, ${archive.plants.length} plants`,
          ...checked.issues.map(
            (issue) =>
              `  ${issue.level === 'error' ? '✗' : '!'} ${issue.file}: ${issue.message}`,
          ),
          ...checked.missing.map(
            (line) =>
              `  ✗ uses ${line.name} ${line.count} time(s), needs ${line.min}`,
          ),
          errors.length || checked.missing.length
            ? `${errors.length} error(s), ${checked.missing.length} gap(s) in coverage`
            : 'The archive keeps to the format and covers everything it must.',
        ],
      );
      return errors.length || checked.missing.length ? 1 : 0;
    },
  },
  seed: {
    summary: 'Seed the running lab site from the archive, convergently',
    usage: 'seed [--archive <dir>|conformance] [--today YYYY-MM-DD] [--json]',
    async run(args) {
      const { values } = parse(args, {
        archive: { type: 'string' },
        today: { type: 'string' },
        json: { type: 'boolean' },
      });
      // Only this checkout's own site: a worktree's port may be another's.
      await requireOwnSite();
      const source = archiveSource(values.archive);
      const previous: SiteIndex | undefined = existsSync(paths.siteIndex)
        ? JSON.parse(readFileSync(paths.siteIndex, 'utf8'))
        : undefined;
      const started = Date.now();
      const result = await seedSite({
        source,
        origin: labLoopbackOrigin(),
        publicOrigin: labOrigin(),
        seedDay: values.today ?? localDay(),
        linkPreviews: false,
        previous,
        log: values.json ? () => {} : (message) => console.log(message),
      });
      result.index.adapter = adapterFingerprint();
      mkdirSync(dirname(paths.siteIndex), { recursive: true });
      writeFileSync(
        paths.siteIndex,
        `${JSON.stringify(result.index, null, 2)}\n`,
      );
      const seconds = Math.round((Date.now() - started) / 1000);
      output(
        values.json ?? false,
        {
          made: result.made,
          saved: result.saved,
          uploaded: result.uploaded,
          warnings: result.warnings,
          seconds,
        },
        () => [
          ...result.warnings.slice(0, 40).map((warning) => `  ! ${warning}`),
          ...(result.warnings.length > 40
            ? [`  … and ${result.warnings.length - 40} more`]
            : []),
          `Seeded in ${seconds} s: ${result.made} made, ${result.saved} saved, ${result.uploaded} files uploaded; the index is ${paths.siteIndex}`,
        ],
      );
    },
  },
};

export async function status(): Promise<StatusLine[]> {
  const lines: StatusLine[] = [];
  if (existsSync(paths.siteIndex)) {
    const index = JSON.parse(
      readFileSync(paths.siteIndex, 'utf8'),
    ) as SiteIndex;
    lines.push({
      part: 'archive',
      ok: index.adapter === adapterFingerprint() ? true : 'warn',
      text: `the site holds archive ${index.archive.version}, seeded ${index.seedDay}${
        index.adapter === adapterFingerprint()
          ? ''
          : ' by another version of the adapter: seed again'
      }`,
    });
  }
  if (readLock())
    try {
      lines.push({
        part: 'archive',
        ok: true,
        text: `${archiveSource().label} fetched`,
      });
    } catch (error) {
      lines.push({
        part: 'archive',
        ok: 'warn',
        text: (error as Error).message,
      });
    }
  return lines;
}
