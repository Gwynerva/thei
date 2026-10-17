import type {
  PublicFile,
  PublicReferenceLink,
  PublicReferences,
  PublicSecretReference,
} from './api/public';
import { isPublicSecret } from './api/public';
import { externalLinkIdentity } from './external-link';

/**
 * What makes two links "the same link" for the sidebar.
 *
 * Internal links already carry the canonical address of their entity, so the
 * kind and href identify them. External addresses are compared as a reader
 * tells pages apart (`externalLinkIdentity`).
 */
export function publicReferenceLinkKey(link: PublicReferenceLink): string {
  if (link.kind !== 'external') return `${link.kind}:${link.href}`;
  return `external:${externalLinkIdentity(link.href)}`;
}

/**
 * One list with every item once. Two copies of one item become one through
 * `merge`, which starts from the earlier copy; when `merge` finds the two
 * would say different things it returns nothing, and both stay.
 */
export function uniquePublicReferences<T>(
  items: T[],
  key: (item: T) => string,
  merge: (first: T, second: T) => T | undefined = (item) => item,
): T[] {
  const kept: { key: string; item: T }[] = [];
  for (const item of items) {
    const itemKey = key(item);
    let merged = false;
    for (const entry of kept) {
      if (entry.key !== itemKey) continue;
      const both = merge(entry.item, item);
      if (both === undefined) continue;
      entry.item = both;
      merged = true;
      break;
    }
    if (!merged) kept.push({ key: itemKey, item });
  }
  return kept.map((entry) => entry.item);
}

/**
 * The same link twice is shown once when that loses nothing: the owner's
 * note is on one copy only, or reads the same on both. Two different notes
 * are two things the owner said, and neither is dropped for the other.
 */
export function mergePublicReferenceLinks(
  first: PublicReferenceLink,
  second: PublicReferenceLink,
): PublicReferenceLink | undefined {
  const words = (note?: string) => note?.replace(/\s+/g, ' ').trim() ?? '';
  if (first.note && second.note && words(first.note) !== words(second.note))
    return undefined;
  const note = first.note || second.note;
  return note ? { ...first, note } : first;
}

export function uniquePublicReferenceLinks(links: PublicReferenceLink[]) {
  return uniquePublicReferences(
    links,
    publicReferenceLinkKey,
    mergePublicReferenceLinks,
  );
}

export function uniquePublicReferenceFiles(
  files: (PublicFile | PublicSecretReference)[],
  fileIdentity: (file: PublicFile) => string = (file) => file.key,
) {
  return uniquePublicReferences(files, (file) =>
    isPublicSecret(file) ? `secret:${file.key}` : `file:${fileIdentity(file)}`,
  );
}

export function emptyPublicReferences(): PublicReferences {
  return { links: [], files: [] };
}
