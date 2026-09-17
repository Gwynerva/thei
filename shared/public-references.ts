import type {
  PublicFile,
  PublicReferenceLink,
  PublicReferenceSplit,
  PublicReferences,
  PublicSecretReference,
} from './api/public';
import { isPublicSecret } from './api/public';

/**
 * What makes two links "the same link" for the sidebar.
 *
 * Internal links already carry the canonical address of their entity, so the
 * kind and href identify them. External addresses are compared without the
 * differences a person does not perceive as a different page: the fragment and
 * a trailing slash.
 */
export function publicReferenceLinkKey(link: PublicReferenceLink): string {
  if (link.kind !== 'external') return `${link.kind}:${link.href}`;
  try {
    const url = new URL(link.href);
    url.hash = '';
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, '');
    return `external:${url.href}`;
  } catch {
    return `external:${link.href}`;
  }
}

/**
 * Splits two reference lists into what both of them hold and what only one
 * does. Duplicates inside one list collapse onto their first occurrence, and a
 * shared item keeps its manual version: that is where its title was written on
 * purpose.
 */
export function splitPublicReferences<T>(
  manual: T[],
  content: T[],
  key: (item: T) => string,
): PublicReferenceSplit<T> {
  const unique = (items: T[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const itemKey = key(item);
      if (seen.has(itemKey)) return false;
      seen.add(itemKey);
      return true;
    });
  };
  const manualItems = unique(manual);
  const contentItems = unique(content);
  const manualKeys = new Set(manualItems.map(key));
  const contentKeys = new Set(contentItems.map(key));
  return {
    shared: manualItems.filter((item) => contentKeys.has(key(item))),
    manual: manualItems.filter((item) => !contentKeys.has(key(item))),
    content: contentItems.filter((item) => !manualKeys.has(key(item))),
  };
}

export function splitPublicReferenceLinks(
  manual: PublicReferenceLink[],
  content: PublicReferenceLink[],
) {
  return splitPublicReferences(manual, content, publicReferenceLinkKey);
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
