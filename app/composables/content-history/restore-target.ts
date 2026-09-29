import type { ContentOutputData } from '#layers/thei/shared/content';
import {
  contentHistoryStats,
  type ContentHistoryEntryMeta,
  type ContentHistoryReason,
  type ContentHistoryStats,
} from '#layers/thei/shared/content-history';
import type { EditorHistoryOffer, EditorHistorySession } from './session';

/**
 * Something the editor can be restored to: a version from the history, a
 * draft another tab keeps, or the text as the editor opened with it. All of
 * them are confirmed the same way.
 */
export interface RestoreTarget {
  kind: 'revision' | 'offer' | 'opened';
  key: string;
  /** When its text was last written; absent for the opened text. */
  time?: number;
  reason?: ContentHistoryReason;
  stats: ContentHistoryStats;
  /** A draft of a new owner this session should go on writing under. */
  adoptRef?: string;
  /** The offered draft it restores, which is taken up once it is. */
  offer?: EditorHistoryOffer;
  load(): Promise<{ data: ContentOutputData; missingAssets: number }>;
}

export function revisionRestoreTarget(
  entry: ContentHistoryEntryMeta,
  session: EditorHistorySession,
): RestoreTarget {
  return {
    kind: 'revision',
    key: entry.id,
    time: entry.updatedAt,
    reason: entry.reason,
    stats: entry,
    load: () =>
      session
        .fetchEntry(entry.id)
        .then(({ data, missingAssets }) => ({ data, missingAssets })),
  };
}

export function offerRestoreTarget(
  offer: EditorHistoryOffer,
  session: EditorHistorySession,
): RestoreTarget {
  return {
    kind: 'offer',
    key: offer.kind === 'server' ? offer.meta.id : 'local',
    time: offer.kind === 'server' ? offer.meta.updatedAt : offer.updatedAt,
    stats: offer.kind === 'server' ? offer.meta : offer.stats,
    adoptRef: offer.kind === 'server' ? offer.adoptRef : undefined,
    offer,
    load: () => session.loadOfferData(offer),
  };
}

export function openedRestoreTarget(data: ContentOutputData): RestoreTarget {
  return {
    kind: 'opened',
    key: 'opened',
    stats: contentHistoryStats(data),
    load: async () => ({ data, missingAssets: 0 }),
  };
}
