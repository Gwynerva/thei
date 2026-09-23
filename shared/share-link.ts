/**
 * Temporary links that open one private project, event, page or diary entry.
 *
 * The durations are deliberately short and few: a share link exists to let
 * someone look at something now, not to become a second, quieter way of
 * publishing it.
 */
export type ShareLinkEntityType = 'project' | 'event' | 'page' | 'diary-entry';

export const SHARE_LINK_DURATIONS = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
} as const;

export type ShareLinkDuration = keyof typeof SHARE_LINK_DURATIONS;

export const SHARE_LINK_DURATION_ORDER: ShareLinkDuration[] = [
  '30m',
  '1h',
  '6h',
  '24h',
];

export function isShareLinkEntityType(
  value: unknown,
): value is ShareLinkEntityType {
  return (
    value === 'project' ||
    value === 'event' ||
    value === 'page' ||
    value === 'diary-entry'
  );
}

export function isShareLinkDuration(
  value: unknown,
): value is ShareLinkDuration {
  return typeof value === 'string' && value in SHARE_LINK_DURATIONS;
}

/** A grant as the page sees it: the address it opens and when it lapses. */
export interface ShareGrantPath {
  path: string;
  expiresAt: number;
}

export interface ShareLinkItem {
  shareUuid: string;
  entityType: ShareLinkEntityType;
  entityUuid: string;
  createdAt: number;
  expiresAt: number;
  /** Present only in the response that created the link. */
  url?: string;
}
