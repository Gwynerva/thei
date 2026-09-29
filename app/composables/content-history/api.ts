import type {
  ContentHistoryDiscardRequest,
  ContentHistoryEntryMeta,
  ContentHistoryEntryResponse,
  ContentHistoryField,
  ContentHistoryIndexResponse,
  ContentHistorySyncRequest,
  ContentHistorySyncResponse,
} from '#layers/thei/shared/content-history';
import type { ContentOwnerType } from '#layers/thei/shared/content';

/** The calls content history makes, kept apart so tests can stand in. */
export interface ContentHistoryTransport {
  sync(request: ContentHistorySyncRequest): Promise<ContentHistorySyncResponse>;
  discard(
    request: ContentHistoryDiscardRequest,
  ): Promise<ContentHistorySyncResponse>;
  dismiss(id: string): Promise<void>;
  index(field: ContentHistoryField): Promise<ContentHistoryIndexResponse>;
  entry(id: string): Promise<ContentHistoryEntryResponse>;
  drafts(
    ownerType: ContentOwnerType,
    ownerRef: string,
  ): Promise<ContentHistoryEntryMeta[]>;
}

const BASE = '/api/admin/content-history';

export const contentHistoryTransport: ContentHistoryTransport = {
  sync: (body) =>
    $fetch<ContentHistorySyncResponse>(`${BASE}/sync`, {
      method: 'POST',
      body,
    }),
  discard: (body) =>
    $fetch<ContentHistorySyncResponse>(`${BASE}/discard`, {
      method: 'POST',
      body,
    }),
  dismiss: async (id) => {
    await $fetch<unknown>(`${BASE}/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
    });
  },
  index: (field) =>
    $fetch<ContentHistoryIndexResponse>(BASE, { query: { ...field } }),
  entry: (id) =>
    $fetch<ContentHistoryEntryResponse>(`${BASE}/${encodeURIComponent(id)}`),
  drafts: (ownerType, ownerRef) =>
    $fetch<ContentHistoryEntryMeta[]>(`${BASE}/drafts`, {
      query: { ownerType, ownerRef },
    }),
};

let tabWriter: string | undefined;

/**
 * This tab as a writer of drafts. Every tab keeps a draft of its own, so two
 * tabs writing one field never overwrite each other. A reload is a new tab:
 * what the previous one left is offered to it like any other tab's draft.
 */
export function contentHistoryTabWriter(): string {
  return (tabWriter ??= crypto.randomUUID());
}

export interface ContentHistoryChange {
  /** The field whose drafts may have changed; absent when any may have. */
  field?: ContentHistoryField;
  /** Announced by another tab. */
  remote: boolean;
}

/**
 * Told whenever a draft of some field may have changed, in this tab or in
 * another one, so whatever shows or offers drafts can look again.
 */
export const contentHistoryEvents = new EventTarget();

function dispatch(change: ContentHistoryChange) {
  contentHistoryEvents.dispatchEvent(
    new CustomEvent<ContentHistoryChange>('change', { detail: change }),
  );
}

let channel: BroadcastChannel | undefined;

/**
 * Connects this tab to the other tabs of the same site, so a draft written in
 * one is offered in the others as it grows. Called during setup, where the
 * site's base path is known; tabs of sites under other paths of the same
 * origin do not hear each other.
 */
export function joinContentHistoryTabs() {
  if (channel || !import.meta.client || typeof BroadcastChannel === 'undefined')
    return;
  channel = new BroadcastChannel(
    `thei:content-history:${useRuntimeConfig().app.baseURL}`,
  );
  channel.onmessage = (event: MessageEvent<{ field?: ContentHistoryField }>) =>
    dispatch({ field: event.data?.field, remote: true });
}

/**
 * Says that drafts of a field may have changed: to this tab and to the
 * others, or only to the others when this tab already knows.
 */
export function announceContentHistoryChange(
  field?: ContentHistoryField,
  to: 'everyone' | 'other-tabs' = 'everyone',
) {
  const plain = field && {
    ownerType: field.ownerType,
    ownerRef: field.ownerRef,
    slot: field.slot,
  };
  if (to === 'everyone') dispatch({ field: plain, remote: false });
  channel?.postMessage({ field: plain });
}

export function isSameContentHistoryField(
  left: ContentHistoryField,
  right: ContentHistoryField,
) {
  return (
    left.ownerType === right.ownerType &&
    left.ownerRef === right.ownerRef &&
    left.slot === right.slot
  );
}
