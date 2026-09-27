import type { AssetContainerType } from './asset';
import type { MediaDescriptor } from './media';

/**
 * Who a status belongs to.
 *
 * The person and a project keep the same kind of history — a dated line about
 * how things are going, newest first, never edited into silence — so they share
 * one model rather than two that drift apart.
 */
export const STATUS_OWNER_TYPES = ['profile', 'project'] as const;
export type StatusOwnerType = (typeof STATUS_OWNER_TYPES)[number];

export type StatusOwner = {
  type: StatusOwnerType;
  /** The profile id, or a project uuid. */
  id: string;
};

export type StatusKind = 'regular' | 'empty';

/**
 * An empty status says "nothing to say"; two in a row would say it twice. So
 * it may only stand right above a regular one: `kind` is that of the status
 * just older than it, absent when there is none.
 */
export function canAppendEmptyStatus(kind?: StatusKind) {
  return kind === 'regular';
}

export interface StatusHistoryItem {
  id: string;
  /** The day the status speaks of, `YYYY-MM-DD`, chosen by the owner. */
  date: string;
  /** When it was written; orders the statuses of one day. */
  createdAt: number;
  kind: StatusKind;
  assetUuid?: string;
  media?: MediaDescriptor;
  text: string;
}

/**
 * `date` is optional on the way in only for an admin panel of the previous
 * release still open in a browser, which knows nothing of it: a status sent
 * without one is dated the day it is saved, as it always was.
 */
export type NewStatus =
  | {
      id: string;
      kind: 'regular';
      text: string;
      assetUuid?: string;
      date?: string;
    }
  | { id: string; kind: 'empty'; date?: string };

/**
 * A saved status rewritten in place. A saved empty status becomes a regular
 * one once it is given something to say, and stays empty when only its date
 * changes. Without a `date` it keeps its own, for the same older panel.
 */
export interface UpdatedStatus {
  id: string;
  text: string;
  assetUuid?: string;
  date?: string;
}

/** Newest first: by the day, then by when it was written. */
export function compareStatusesNewestFirst(
  left: Pick<StatusHistoryItem, 'date' | 'createdAt' | 'id'>,
  right: Pick<StatusHistoryItem, 'date' | 'createdAt' | 'id'>,
) {
  return (
    right.date.localeCompare(left.date) ||
    right.createdAt - left.createdAt ||
    (left.id < right.id ? 1 : left.id > right.id ? -1 : 0)
  );
}

/** The three lists any owner's status editor sends back. */
export interface StatusEditData {
  newStatuses: NewStatus[];
  updatedStatuses: UpdatedStatus[];
  deletedStatusIds: string[];
}

export function emptyStatusEditData(): StatusEditData {
  return { newStatuses: [], updatedStatuses: [], deletedStatusIds: [] };
}

/**
 * Adds what pending status edits do to each icon's usage count into `delta`,
 * so a file picker shows an asset's real reuse before the form is saved.
 * `saved` is the loaded history the edits refer to.
 */
export function addStatusUsageDelta(
  delta: Record<string, number>,
  edits: Partial<StatusEditData>,
  saved: readonly StatusHistoryItem[],
) {
  const add = (id: string | null | undefined, amount: number) => {
    if (id) delta[id] = (delta[id] ?? 0) + amount;
  };
  const savedIcon = (id: string) => saved.find((s) => s.id === id)?.assetUuid;
  for (const status of edits.newStatuses ?? [])
    if (status.kind === 'regular') add(status.assetUuid, 1);
  for (const id of edits.deletedStatusIds ?? []) add(savedIcon(id), -1);
  for (const status of edits.updatedStatuses ?? []) {
    add(savedIcon(status.id), -1);
    add(status.assetUuid, 1);
  }
  return delta;
}

/**
 * The asset-usage container a status icon is recorded under.
 *
 * Kept per owner kind rather than collapsed into one `status` container: the
 * existing rows already say `profile-status`, and rewriting them would touch
 * reuse counting for no gain.
 */
export function statusAssetContainer(
  ownerType: StatusOwnerType,
): AssetContainerType {
  return ownerType === 'project' ? 'project-status' : 'profile-status';
}
