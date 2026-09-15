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
  /** Favicons fetched for external link previews. Regenerable cache. */
  externalLinkFavicons: 'external-link-favicons',
} as const;

export type TheiContentDir =
  (typeof THEI_CONTENT_DIRS)[keyof typeof THEI_CONTENT_DIRS];
