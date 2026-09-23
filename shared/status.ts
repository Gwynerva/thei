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

/** An empty status says "nothing to say"; two in a row would say it twice. */
export function canAppendEmptyStatus(kind?: StatusKind) {
  return kind === 'regular';
}

export interface StatusHistoryItem {
  id: string;
  createdAt: number;
  kind: StatusKind;
  assetUuid?: string;
  media?: MediaDescriptor;
  text: string;
}

export type NewStatus =
  | { id: string; kind: 'regular'; text: string; assetUuid?: string }
  | { id: string; kind: 'empty' };

/**
 * A saved status rewritten in place; it keeps its date. A saved empty status
 * becomes a regular one this way.
 */
export interface UpdatedStatus {
  id: string;
  text: string;
  assetUuid?: string;
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
