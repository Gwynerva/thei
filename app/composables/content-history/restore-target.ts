import type { ContentOutputData } from '#layers/thei/shared/content';
import type {
  ContentHistoryEntryMeta,
  ContentHistoryReason,
} from '#layers/thei/shared/content-history';
import type { EditorHistoryOffer, EditorHistorySession } from './session';

/**
 * Something the editor's text can be compared with and taken from: a version
 * from the history, a draft another tab keeps, the text as the editor opened
 * with it, or the text saved elsewhere meanwhile. All of them are gone
 * through the same way.
 */
export interface RestoreTarget {
  kind: 'revision' | 'offer' | 'opened' | 'stored';
  /** When its text was last written; absent for the opened text. */
  time?: number;
  reason?: ContentHistoryReason;
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
    time: entry.updatedAt,
    reason: entry.reason,
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
    time: offer.kind === 'server' ? offer.meta.updatedAt : offer.updatedAt,
    adoptRef: offer.kind === 'server' ? offer.adoptRef : undefined,
    offer,
    load: () => session.loadOfferData(offer),
  };
}

export function openedRestoreTarget(data: ContentOutputData): RestoreTarget {
  return {
    kind: 'opened',
    load: async () => ({ data, missingAssets: 0 }),
  };
}
