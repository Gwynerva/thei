import type {
  PublicFile,
  PublicReferenceLink,
  PublicReferenceSplit,
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
 * Splits two reference lists into what both of them hold and what only one
 * does.
 *
 * Two copies of one item become one through `merge`, which starts from the
 * first of them — inside one list, the earlier copy; across the lists, the
 * manual one. When `merge` finds the two would say different things it
 * returns nothing: inside a list the earlier copy stands, and across the
 * lists each stays in its own.
 */
export function splitPublicReferences<T>(
  manual: T[],
  content: T[],
  key: (item: T) => string,
  merge: (first: T, second: T) => T | undefined = (item) => item,
): PublicReferenceSplit<T> {
  const unique = (items: T[]) => {
    const byKey = new Map<string, T>();
    for (const item of items) {
      const itemKey = key(item);
      const kept = byKey.get(itemKey);
      byKey.set(
        itemKey,
        kept === undefined ? item : (merge(kept, item) ?? kept),
      );
    }
    return byKey;
  };
  const contentItems = unique(content);
  const split: PublicReferenceSplit<T> = {
    shared: [],
    manual: [],
    content: [],
  };
  const merged = new Set<string>();
  for (const [itemKey, item] of unique(manual)) {
    const twin = contentItems.get(itemKey);
    const shared = twin === undefined ? undefined : merge(item, twin);
    if (shared === undefined) {
      split.manual.push(item);
      continue;
    }
    split.shared.push(shared);
    merged.add(itemKey);
  }
  for (const [itemKey, item] of contentItems)
    if (!merged.has(itemKey)) split.content.push(item);
  return split;
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

export function splitPublicReferenceLinks(
  manual: PublicReferenceLink[],
  content: PublicReferenceLink[],
) {
  return splitPublicReferences(
    manual,
    content,
    publicReferenceLinkKey,
    mergePublicReferenceLinks,
  );
}

export function splitPublicReferenceFiles(
  manual: (PublicFile | PublicSecretReference)[],
  content: (PublicFile | PublicSecretReference)[],
  fileIdentity: (file: PublicFile) => string = (file) => file.key,
) {
  return splitPublicReferences(manual, content, (file) =>
    isPublicSecret(file) ? `secret:${file.key}` : `file:${fileIdentity(file)}`,
  );
}

export function publicReferenceSplitSize(split: PublicReferenceSplit<unknown>) {
  return split.shared.length + split.manual.length + split.content.length;
}

export function emptyPublicReferences(): PublicReferences {
  return {
    links: { shared: [], manual: [], content: [] },
    files: { shared: [], manual: [], content: [] },
  };
}
