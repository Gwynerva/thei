/**
 * Every directory the engine owns inside `content/`.
 *
 * Declared in one place on purpose: cleanup only ever sweeps directories it
 * knows about, so a layout that moves without updating this list leaves files
 * behind that nothing will ever reclaim.
 */
export const THEI_CONTENT_DIRS = {
  /** Uploaded and derived asset files, addressed by content hash. */
  assets: 'assets',
  /** Procedurally generated entity icons. Regenerable cache. */
  generatedMedia: 'generated-media',
  /** Favicons of external links, fetched once when a link is put in. */
  externalLinkFavicons: 'external-link-favicons',
} as const;

export type TheiContentDir =
  (typeof THEI_CONTENT_DIRS)[keyof typeof THEI_CONTENT_DIRS];

/**
 * Directories a backup has to capture.
 *
 * `assets` holds uploaded originals **and** derived variants. The variants are
 * not a cache: nothing regenerates them, bulk re-encoding is forbidden, and a
 * missing file makes cleanup delete the `assets` row that points at it. Leaving
 * them out of a backup loses data rather than saving space.
 *
 * External link favicons are read from a site once, when the admin puts the
 * link in, and never again on the engine's own initiative: a missing file is
 * served as a neutral tile until the link is refreshed by hand. They are tiny,
 * so a backup keeps them.
 */
export const THEI_BACKUP_DIRS: readonly TheiContentDir[] = [
  THEI_CONTENT_DIRS.assets,
  THEI_CONTENT_DIRS.externalLinkFavicons,
];

/**
 * Directories the engine rebuilds on demand.
 *
 * Deliberately left out of backups: icons are redrawn the first time
 * something asks for them.
 */
export const THEI_REGENERABLE_DIRS: readonly TheiContentDir[] = [
  THEI_CONTENT_DIRS.generatedMedia,
];

/** Files at the root of `content/` that a backup has to capture. */
export const THEI_BACKUP_FILES = ['thei.db', 'thei.config.json'] as const;

/**
 * Directories declared above but classified as neither backed up nor
 * regenerable.
 *
 * A new directory that nobody classified would silently fall out of every
 * backup — the same failure `THEI_CONTENT_DIRS` exists to prevent for cleanup,
 * so it is checked the same way rather than left to review.
 */
export function unclassifiedContentDirs(): TheiContentDir[] {
  const classified = new Set<string>([
    ...THEI_BACKUP_DIRS,
    ...THEI_REGENERABLE_DIRS,
  ]);
  return Object.values(THEI_CONTENT_DIRS).filter(
    (directory) => !classified.has(directory),
  );
}
