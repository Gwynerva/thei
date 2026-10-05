import {
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  shallowRef,
  toValue,
  watch,
  type InjectionKey,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue';
import type {
  ContentOwnerType,
  ContentSlot,
} from '#layers/thei/shared/content';
import {
  isNewContentOwnerRef,
  type ContentHistoryEntryMeta,
  type ContentHistoryField,
} from '#layers/thei/shared/content-history';
import {
  contentHistoryEvents,
  contentHistoryTransport,
  joinContentHistoryTabs,
  type ContentHistoryChange,
} from './api';

/**
 * Whose content fields a form holds, so each field knows where its history
 * lives and whether an unsaved draft of it is waiting.
 */
export interface ContentOwnerContext {
  ownerType: ContentOwnerType;
  /** The owner's id, or `undefined` while it is not created yet. */
  ownerId(): string | undefined;
  /**
   * Whether a field of an owner not created yet is offered the latest draft
   * written for a new one. A form for a whole new entity says yes; a section
   * inside a project does not, since it could not tell whose draft it is.
   */
  offersPendingDrafts: boolean;
  /**
   * The drafts of the owner's fields, newest first: one per field and tab.
   * For an owner not created yet, the drafts of every new one of its kind.
   */
  drafts: ShallowRef<ContentHistoryEntryMeta[]>;
  draftsFor(slot: ContentSlot): ContentHistoryEntryMeta[];
  refresh(): Promise<void>;
}

const key: InjectionKey<ContentOwnerContext> = Symbol('content-owner');

export function provideContentOwner(
  ownerType: ContentOwnerType,
  ownerId: MaybeRefOrGetter<string | undefined>,
  options: { offersPendingDrafts?: boolean } = {},
): ContentOwnerContext {
  const drafts = shallowRef<ContentHistoryEntryMeta[]>([]);
  const offersPendingDrafts = options.offersPendingDrafts ?? true;
  let request = 0;
  joinContentHistoryTabs();

  async function refresh() {
    if (!import.meta.client) return;
    const id = toValue(ownerId);
    if (!id && !offersPendingDrafts) {
      drafts.value = [];
      return;
    }
    const current = ++request;
    try {
      const result = await contentHistoryTransport.drafts(
        ownerType,
        id ?? 'new',
      );
      if (current === request) drafts.value = result;
    } catch {
      // Without the list the fields simply show no draft; editing is unaffected.
    }
  }

  const context: ContentOwnerContext = {
    ownerType,
    ownerId: () => toValue(ownerId),
    offersPendingDrafts,
    drafts,
    draftsFor: (slot) => drafts.value.filter((draft) => draft.slot === slot),
    refresh,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Whether a change of drafts may touch this owner's list: its own fields,
   * or, before it exists, those of any new owner of its kind.
   */
  const concerns = (field: ContentHistoryField) => {
    if (field.ownerType !== ownerType) return false;
    const id = toValue(ownerId);
    return id ? field.ownerRef === id : isNewContentOwnerRef(field.ownerRef);
  };
  const onChange = (event: Event) => {
    const change = (event as CustomEvent<ContentHistoryChange>).detail;
    if (change?.field && !concerns(change.field)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 300);
  };
  onMounted(() => {
    void refresh();
    contentHistoryEvents.addEventListener('change', onChange);
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
    contentHistoryEvents.removeEventListener('change', onChange);
  });
  watch(
    () => toValue(ownerId),
    () => void refresh(),
  );

  provide(key, context);
  return context;
}

export function injectContentOwner(): ContentOwnerContext | undefined {
  return inject(key, undefined);
}
