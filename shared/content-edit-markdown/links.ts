import {
  isContentEntityType,
  normalizeLinkFragment,
  type ContentEntityType,
} from '../content-link';

/**
 * Links to things on this site, as the editing Markdown writes them:
 * `thei:<kind>/<id>`, with the place inside the target after `#`.
 *
 * A link names its target by kind and id, as stored content does, so it does
 * not depend on where the site lives. A diary entry may also be named by its
 * day on the way in (`thei:diary-entry/2026-10-14`), which the server turns
 * into its id.
 */
export const THEI_LINK_SCHEME = 'thei:';

export interface TheiLinkTarget {
  entityType: ContentEntityType;
  /** An entity's id, or a diary entry's day as given on the way in. */
  entityId: string;
  fragment?: string;
}

export function theiLinkUrl(target: TheiLinkTarget): string {
  const fragment = normalizeLinkFragment(target.fragment);
  return `${THEI_LINK_SCHEME}${target.entityType}/${target.entityId}${
    fragment ? `#${fragment}` : ''
  }`;
}

/** Whether an address is meant for this site, whether or not it names anything. */
export function isTheiLinkUrl(value: string): boolean {
  return value.toLowerCase().startsWith(THEI_LINK_SCHEME);
}

export function parseTheiLinkUrl(value: string): TheiLinkTarget | undefined {
  if (!isTheiLinkUrl(value)) return undefined;
  const rest = value.slice(THEI_LINK_SCHEME.length);
  const hash = rest.indexOf('#');
  const path = hash < 0 ? rest : rest.slice(0, hash);
  const slash = path.indexOf('/');
  if (slash < 0) return undefined;
  const entityType = path.slice(0, slash);
  const entityId = path.slice(slash + 1).trim();
  if (!isContentEntityType(entityType) || !entityId || entityId.includes('/'))
    return undefined;
  const fragment =
    hash < 0 ? undefined : normalizeLinkFragment(rest.slice(hash + 1));
  return { entityType, entityId, ...(fragment ? { fragment } : {}) };
}
