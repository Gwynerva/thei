import type { AssetLibraryHere } from '#layers/thei/shared/asset-library';

const EDITED: Record<string, AssetLibraryHere['type']> = {
  projects: 'project',
  events: 'event',
  pages: 'page',
  tags: 'tag',
  diary: 'diary-entry',
};

/**
 * What the admin is editing, read from the page a picker was opened over:
 * its files and those of what it is related to come first in the library.
 * A section or an excerpt is edited in its parent's form, so the parent is
 * what is here. Nothing outside an entity's form.
 */
export function libraryHereOf(path: string): AssetLibraryHere | undefined {
  const match =
    /^\/admin\/(projects|events|pages|tags|diary)\/([^/]+)\/edit\/?$/.exec(
      path,
    );
  if (!match) return undefined;
  return { type: EDITED[match[1]!]!, id: decodeURIComponent(match[2]!) };
}
