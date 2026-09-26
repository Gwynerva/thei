/**
 * Temporary links that open one private project, event, page or diary entry.
 *
 * The durations are deliberately short and few: a share link exists to let
 * someone look at something now, not to become a second, quieter way of
 * publishing it.
 */
export const SHARE_LINK_ENTITY_TYPES = [
  'project',
  'event',
  'page',
  'diary-entry',
] as const;

export type ShareLinkEntityType = (typeof SHARE_LINK_ENTITY_TYPES)[number];

/** Shortest first: the order the owner is offered them in. */
export const SHARE_LINK_DURATIONS = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
} as const;

export type ShareLinkDuration = keyof typeof SHARE_LINK_DURATIONS;

export const SHARE_LINK_DURATION_KEYS = Object.keys(
  SHARE_LINK_DURATIONS,
) as ShareLinkDuration[];

/**
 * How far ahead a link may ever be open. Extending adds to what is left but
 * never past this, so no link outlives a day without the owner's fresh say.
 */
export const SHARE_LINK_MAX_MS = Math.max(
  ...Object.values(SHARE_LINK_DURATIONS),
);

/** The owner's note on who a link is for; a name, not a letter. */
export const SHARE_LINK_LABEL_MAX = 60;

/** How a grant is keyed: one entity, whatever link opened it. */
export function shareGrantKey(
  entityType: ShareLinkEntityType,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}

export function isShareLinkEntityType(
  value: unknown,
): value is ShareLinkEntityType {
  return SHARE_LINK_ENTITY_TYPES.includes(value as ShareLinkEntityType);
}

export function isShareLinkDuration(
  value: unknown,
): value is ShareLinkDuration {
  return (
    typeof value === 'string' && Object.hasOwn(SHARE_LINK_DURATIONS, value)
  );
}

/**
 * The expiry an extension leads to: the duration added to what is left, and
 * never further than `SHARE_LINK_MAX_MS` from now.
 */
export function extendedShareLinkExpiry(
  expiresAt: number,
  duration: ShareLinkDuration,
  now: number,
): number {
  return Math.min(
    Math.max(expiresAt, now) + SHARE_LINK_DURATIONS[duration],
    now + SHARE_LINK_MAX_MS,
  );
}

/**
 * How much of a link's current term is left, from 1 to 0. The term starts at
 * creation or at the last extension, so extending refills it.
 */
export function shareLinkRemainingShare(
  link: Pick<ShareLinkItem, 'createdAt' | 'extendedAt' | 'expiresAt'>,
  now: number,
): number {
  const term = link.expiresAt - (link.extendedAt ?? link.createdAt);
  if (term <= 0) return 0;
  return Math.min(1, Math.max(0, (link.expiresAt - now) / term));
}

/** How close a link is to closing: below 40% of its term, then below 20%. */
export type ShareLinkUrgency = 'calm' | 'soon' | 'closing';

export function shareLinkUrgency(remainingShare: number): ShareLinkUrgency {
  if (remainingShare < 0.2) return 'closing';
  if (remainingShare < 0.4) return 'soon';
  return 'calm';
}

/**
 * Whole hours and minutes left, to the nearest minute — a fresh hour-long
 * link reads "1 h", not "1 h 1 min" for the second the clock lags — and never
 * "0 min" while anything is left.
 */
export function splitShareLinkRemaining(ms: number): {
  hours: number;
  minutes: number;
} {
  const minutes = ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/**
 * The entity whose share link opens something: the thing itself for a
 * project, event, page or diary entry, and the project for its stages and
 * sections.
 */
export interface ShareGrantOwner {
  entityType: ShareLinkEntityType;
  entityId: string;
}

/** A grant as the page sees it: the address it opens and when it lapses. */
export interface ShareGrantPath {
  path: string;
  expiresAt: number;
  /**
   * The entity is private as a whole, so everything on its pages is
   * unpublished — not only the private parts of a public one.
   */
  whole: boolean;
}

export interface ShareLinkItem {
  shareUuid: string;
  entityType: ShareLinkEntityType;
  entityUuid: string;
  label: string;
  createdAt: number;
  /** The start of the current term when the link has been extended. */
  extendedAt: number | null;
  expiresAt: number;
  /** The address to hand out, which the owner can copy at any time. */
  url: string;
}
