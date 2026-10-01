import {
  contentSemanticKey,
  summarizeContentData,
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
} from './content';
import { cyrb53 } from './utils/hash';

/**
 * The history of a content field: its unsaved draft and the versions it went
 * through while it was being written.
 *
 * It is a safety net for the time of writing and the day after, not an
 * archive. Saving means agreeing with what is there; the versions before it
 * stay long enough to change one's mind the next day, and then they go.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long every version is kept, whatever made it. */
export const CONTENT_HISTORY_REVISION_TTL_MS = 48 * HOUR;
/** A draft of something never created is let go after this long untouched. */
export const CONTENT_HISTORY_ABANDONED_DRAFT_MS = 7 * DAY;
/** A draft row covers at most this much writing before it becomes a version. */
export const CONTENT_HISTORY_SLICE_MS = 3 * MINUTE;
/**
 * A draft written to within this long belongs to an editor still at work:
 * saving the field from elsewhere leaves it be. An older one is set aside as
 * a version, since the text was decided on after it.
 */
export const CONTENT_HISTORY_ACTIVE_DRAFT_MS = MINUTE;
/** The versions of one field never take more than this much JSON. */
export const CONTENT_HISTORY_FIELD_CAP = 10 * 1024 * 1024;

/** A field whose owner does not exist yet is addressed as `new~<uuid>`. */
export const CONTENT_HISTORY_NEW_REF_PREFIX = 'new~';
const NEW_REF_PATTERN =
  /^new~[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const CONTENT_HISTORY_REASONS = [
  'auto',
  'before-restore',
  'before-clear',
  'large-drop',
  'discarded',
  'dismissed',
  'displaced',
  'replaced',
  'cleared',
  'deleted',
  'abandoned',
] as const;
export type ContentHistoryReason = (typeof CONTENT_HISTORY_REASONS)[number];

/** What an editor may say about the write it sends. */
export const CONTENT_HISTORY_HINTS = [
  'before-restore',
  'before-clear',
] as const;
export type ContentHistoryHint = (typeof CONTENT_HISTORY_HINTS)[number];

export type ContentHistoryKind = 'draft' | 'revision';

export interface ContentHistoryField {
  ownerType: ContentOwnerType;
  /** The owner's id, or `new~<uuid>` while the owner is not created yet. */
  ownerRef: string;
  slot: ContentSlot;
}

export interface ContentHistoryStats {
  wordCount: number;
  blockCount: number;
  assetCount: number;
}

export interface ContentHistoryEntryMeta extends ContentHistoryStats {
  id: string;
  ownerType: ContentOwnerType;
  ownerRef: string;
  slot: ContentSlot;
  kind: ContentHistoryKind;
  reason?: ContentHistoryReason;
  digest: string;
  /** The tab whose draft it is: each tab keeps a draft of its own. */
  writer: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContentHistoryIndexResponse {
  /** The drafts of the field, one per tab writing it, newest first. */
  drafts: ContentHistoryEntryMeta[];
  revisions: ContentHistoryEntryMeta[];
}

export interface ContentHistoryEntryResponse {
  entry: ContentHistoryEntryMeta;
  /** Hydrated as the editor reads it. Files that are gone are left out. */
  data: ContentOutputData;
  /** How many files the version referred to that no longer exist. */
  missingAssets: number;
}

export interface ContentHistorySyncRequest extends ContentHistoryField {
  writer: string;
  data: ContentOutputData;
  hint?: ContentHistoryHint;
}

export interface ContentHistorySyncResponse {
  /** The writer's own draft, or `null` when its text is what is saved. */
  draft: ContentHistoryEntryMeta | null;
  /** The drafts other tabs keep of the same field, newest first. */
  others: ContentHistoryEntryMeta[];
}

export interface ContentHistoryDiscardRequest extends ContentHistoryField {
  writer: string;
  /** What the form still holds; it stays protected as the draft. */
  replacement?: ContentOutputData | null;
}

export function isNewContentOwnerRef(value: unknown): value is `new~${string}` {
  return typeof value === 'string' && NEW_REF_PATTERN.test(value);
}

export function createNewContentOwnerRef(): string {
  return `${CONTENT_HISTORY_NEW_REF_PREFIX}${crypto.randomUUID()}`;
}

/**
 * The `draftRef` a content field value may carry: the history its text was
 * written under before its owner existed. Anything else is dropped.
 */
export function optionalContentDraftRef(value: unknown): {
  draftRef?: string;
} {
  return isNewContentOwnerRef(value) ? { draftRef: value } : {};
}

/**
 * A short fingerprint of what the content says, blind to block ids and to
 * hydrated presentation, exactly like the dirty check.
 */
export function contentDigest(
  data: ContentOutputData | null | undefined,
): string {
  return contentDigestOfKey(contentSemanticKey(data));
}

export function contentDigestOfKey(semanticKey: string): string {
  return cyrb53(semanticKey).toString(36);
}

export function contentHistoryStats(
  data: ContentOutputData | null | undefined,
): ContentHistoryStats {
  const { wordCount, blockCount, assetCount } = summarizeContentData(data);
  return { wordCount, blockCount, assetCount };
}

/**
 * Whether going from one state to the other loses a noticeable part of the
 * text. The server keeps the earlier state when it happens; the history list
 * warns before a restore would do it.
 */
export function isLargeContentDrop(
  from: Pick<ContentHistoryStats, 'wordCount' | 'blockCount'>,
  to: Pick<ContentHistoryStats, 'wordCount' | 'blockCount'>,
): boolean {
  // Emptying a text loses all of it, however short it was.
  if (from.wordCount > 0 && to.wordCount === 0) return true;
  const lostWords = from.wordCount - to.wordCount;
  if (lostWords >= 100) return true;
  if (from.wordCount >= 30 && to.wordCount * 2 <= from.wordCount) return true;
  return from.blockCount - to.blockCount >= 5;
}
