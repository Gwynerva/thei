import { computed, readonly, ref, shallowRef } from 'vue';
import {
  canonicalizeContentData,
  contentSemanticKey,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import {
  contentDigest,
  contentDigestOfKey,
  contentHistoryStats,
  isLargeContentDrop,
  type ContentHistoryEntryMeta,
  type ContentHistoryEntryResponse,
  type ContentHistoryField,
  type ContentHistoryHint,
  type ContentHistoryIndexResponse,
  type ContentHistoryStats,
} from '#layers/thei/shared/content-history';
import { cloneSerializable } from '#layers/thei/app/composables/serializable-state';
import { cleanEditorSnapshot } from '#layers/thei/app/composables/editor-output';
import {
  announceContentHistoryChange,
  contentHistoryEvents,
  contentHistoryTabWriter,
  isSameContentHistoryField,
  type ContentHistoryChange,
  type ContentHistoryTransport,
} from './api';
import {
  activeBufferKeys,
  browserContentHistoryLocks,
  contentHistoryBufferKey,
  flushContentHistoryBuffers,
  isRefusedWrite,
  type ContentHistoryBuffer,
  type ContentHistoryBufferEntry,
  type ContentHistoryWriterLocks,
} from './buffer';

/**
 * One editor's session over one content field.
 *
 * It reads the editor whenever it changes, and waits for the editor to hold
 * still before trusting what it read. With a `history` it also keeps the
 * tab's draft of the field on the server: a few seconds after typing pauses,
 * and at the latest every ten seconds while it goes on. What the server has
 * not confirmed yet is kept in the browser and sent later, so neither a
 * closed tab nor a lost connection loses it.
 *
 * Restoring and clearing go through the same path: the text as it is now is
 * sent first, and the text that replaces it is sent with a hint, so the
 * server keeps the earlier one as a version. So does a single change that
 * loses a large part of the text.
 *
 * Drafts other tabs keep of the field are offered as they grow: another tab
 * of this browser says when it wrote, the server tells with every write, and
 * the tab looks again when it is shown.
 */

export type EditorHistoryStatus =
  'off' | 'synced' | 'pending' | 'saving' | 'offline';

export interface EditorHistoryState {
  data: ContentOutputData;
  /** `contentSemanticKey` of the data: equal keys, equal content. */
  key: string;
}

/** A draft this editor could take up. */
export type EditorHistoryOffer =
  | {
      kind: 'server';
      meta: ContentHistoryEntryMeta;
      /** The draft belongs to a new owner this session should write under. */
      adoptRef?: string;
    }
  | {
      /** Text a tab left in this browser that the server never received. */
      kind: 'local';
      entry: ContentHistoryBufferEntry;
      data: ContentOutputData;
      digest: string;
      updatedAt: number;
      stats: ContentHistoryStats;
    };

export interface EditorHistoryLifecycle {
  /** Runs the callback when the page is hidden or left; returns an unbind. */
  onHide(callback: () => void): () => void;
  /** Runs the callback when the page is looked at again; returns an unbind. */
  onShow(callback: () => void): () => void;
  /** Runs the callback when the connection comes back; returns an unbind. */
  onOnline(callback: () => void): () => void;
}

export interface EditorHistorySessionOptions {
  read: () => Promise<ContentOutputData>;
  render: (data: ContentOutputData) => Promise<void>;
  onCurrentChange?: (state: EditorHistoryState) => void;
  onError?: (error: unknown, kind: 'read' | 'restore') => void;
  /** Where the field's history lives. Without it nothing is kept. */
  history?: {
    field: ContentHistoryField;
    transport: ContentHistoryTransport;
    buffer?: ContentHistoryBuffer;
    /** Which tabs of the browser are open; the browser's Web Locks by default. */
    locks?: ContentHistoryWriterLocks;
    /**
     * The latest draft written for another new owner of the same kind, which
     * a field of an owner not created yet may take up. Read reactively.
     */
    pending?: () => ContentHistoryEntryMeta | undefined;
  };
  writer?: string;
  now?: () => number;
  timing?: Partial<EditorHistoryTiming>;
  lifecycle?: EditorHistoryLifecycle;
  /** Where changes made by other tabs are heard; the page's own by default. */
  events?: EventTarget;
}

export interface EditorHistoryTiming {
  /** Quiet time after the last change before the draft is sent. */
  debounceMs: number;
  /** Longest a changed text waits while typing goes on. */
  maxWaitMs: number;
  /** Quiet time before the unconfirmed text is written to the browser. */
  bufferMs: number;
  /** Waits between attempts while the server cannot be reached. */
  retryMs: number[];
  /** Quiet time before the drafts of other tabs are looked up again. */
  refreshMs: number;
}

const DEFAULT_TIMING: EditorHistoryTiming = {
  debounceMs: 2_000,
  maxWaitMs: 10_000,
  bufferMs: 1_000,
  retryMs: [5_000, 15_000, 30_000, 60_000],
  refreshMs: 300,
};

interface PendingWrite {
  field: ContentHistoryField;
  data: ContentOutputData;
  key: string;
  hint?: ContentHistoryHint;
  /** Kept as its own write, never merged into the next one. */
  sealed?: boolean;
}

/** Writes kept at most while the server cannot be reached. */
const QUEUE_LIMIT = 5;

export function createEditorHistorySession(
  options: EditorHistorySessionOptions,
) {
  const now = options.now ?? Date.now;
  const timing = { ...DEFAULT_TIMING, ...options.timing };
  const history = options.history;
  const writer = options.writer ?? contentHistoryTabWriter();
  const locks = history?.locks ?? browserContentHistoryLocks;
  const fieldRef = shallowRef(history?.field);

  const isApplying = ref(false);
  const isCapturing = ref(false);
  const hasPendingCapture = ref(false);
  const isPending = computed(
    () => isCapturing.value || hasPendingCapture.value || isApplying.value,
  );
  const status = ref<EditorHistoryStatus>(history ? 'synced' : 'off');
  const lastSyncedAt = ref<number>();
  /** The text before the last restore, until the next edit. */
  const lastRestore = shallowRef<EditorHistoryState>();
  const bufferAvailable = ref(true);

  let currentData = cleanEditorSnapshot({ blocks: [] });
  let currentKey = contentSemanticKey(currentData);
  const currentDigest = shallowRef(contentDigestOfKey(currentKey));
  let currentStats: ContentHistoryStats | undefined;
  let initialized = false;
  let changeVersion = 0;
  let captureLoopPromise: Promise<void> | undefined;
  let destroyed = false;
  let closed = false;

  let ackedKey = currentKey;
  const queue: PendingWrite[] = [];
  let inFlight: PendingWrite | undefined;
  let sending: Promise<void> | undefined;
  let resendRequested = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let bufferTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let retryIndex = 0;
  const unbinds: (() => void)[] = [];

  const hasUnconfirmed = () =>
    Boolean(queue.length || inFlight || currentKey !== ackedKey);
  const needsUnloadGuard = computed(
    () =>
      Boolean(history) &&
      !bufferAvailable.value &&
      status.value !== 'synced' &&
      status.value !== 'off',
  );

  // --- Reading the editor ---------------------------------------------------

  async function initialize() {
    const data = await readStable();
    if (destroyed) return cloneSerializable(data);
    setCurrent(data);
    ackedKey = currentKey;
    if (history && fieldRef.value) {
      currentStats = contentHistoryStats(currentData);
      // Held before anything is buffered: other tabs leave this one's
      // unconfirmed text to it for as long as it is open.
      locks.hold(writer);
      activeBufferKeys.add(contentHistoryBufferKey(fieldRef.value, writer));
      takeOverLeftovers();
      const lifecycle = options.lifecycle ?? browserLifecycle;
      const events = options.events ?? contentHistoryEvents;
      events.addEventListener('change', onChangeElsewhere);
      unbinds.push(
        lifecycle.onHide(onHide),
        lifecycle.onShow(() => scheduleRefresh()),
        lifecycle.onOnline(onOnline),
        () => events.removeEventListener('change', onChangeElsewhere),
      );
    }
    initialized = true;
    if (queue.length) void send();
    return cloneSerializable(data);
  }

  function recordChange() {
    if (destroyed || isApplying.value) return;
    changeVersion += 1;
    hasPendingCapture.value = true;
    startCaptureLoop();
  }

  async function synchronize() {
    await flushCapture();
    const data = await readStable();
    setCurrent(data);
    return cloneSerializable(data);
  }

  function current() {
    return cloneSerializable(currentData);
  }

  function startCaptureLoop() {
    if (captureLoopPromise || destroyed || isApplying.value) return;
    captureLoopPromise = captureLoop().finally(() => {
      captureLoopPromise = undefined;
      if (hasPendingCapture.value && !destroyed && !isApplying.value) {
        startCaptureLoop();
      }
    });
  }

  async function captureLoop() {
    isCapturing.value = true;
    try {
      while (hasPendingCapture.value && !destroyed && !isApplying.value) {
        hasPendingCapture.value = false;
        try {
          const data = await readStable();
          if (!destroyed && !isApplying.value) setCurrent(data);
        } catch (error) {
          if (!destroyed) options.onError?.(error, 'read');
        }
      }
    } finally {
      isCapturing.value = false;
    }
  }

  async function flushCapture() {
    if (hasPendingCapture.value && !isApplying.value) startCaptureLoop();
    while (captureLoopPromise) await captureLoopPromise;
  }

  async function readStable() {
    while (true) {
      const version = changeVersion;
      const data = cleanEditorSnapshot(await options.read());
      if (version === changeVersion || destroyed || isApplying.value) {
        return data;
      }
    }
  }

  function setCurrent(data: ContentOutputData, force = false) {
    const next = cleanEditorSnapshot(data);
    const key = contentSemanticKey(next);
    const previous = { data: currentData, key: currentKey };
    currentData = next;
    if (!force && key === currentKey) return;
    currentKey = key;
    if (history) currentDigest.value = contentDigestOfKey(key);
    options.onCurrentChange?.({ data: cloneSerializable(next), key });
    // Restores and clears send what they did themselves.
    if (!history || !initialized || isApplying.value || closed) return;
    lastRestore.value = undefined;
    const previousStats = currentStats;
    currentStats = contentHistoryStats(next);
    if (previousStats && isLargeContentDrop(previousStats, currentStats)) {
      // The text just before the loss goes out as it was, so the server keeps
      // exactly that, not whatever it last received seconds earlier.
      enqueue({ field: fieldRef.value!, ...previous, sealed: true });
      enqueueCurrent();
      void send();
      return;
    }
    scheduleSync();
  }

  // --- Sending --------------------------------------------------------------

  function lastQueuedKey() {
    return queue.at(-1)?.key ?? inFlight?.key ?? ackedKey;
  }

  function enqueue(write: PendingWrite) {
    if (write.key === lastQueuedKey() && !write.hint) return;
    const last = queue.at(-1);
    // Successive plain writes of one field collapse into the latest.
    if (
      last &&
      !last.hint &&
      !last.sealed &&
      !write.hint &&
      last.field.ownerRef === write.field.ownerRef
    )
      queue[queue.length - 1] = write;
    else queue.push(write);
    while (queue.length > QUEUE_LIMIT) {
      const plain = queue.findIndex((item) => !item.hint);
      if (plain < 0 || plain === queue.length - 1) break;
      queue.splice(plain, 1);
    }
  }

  function enqueueCurrent(hint?: ContentHistoryHint, sealed = false) {
    const field = fieldRef.value;
    if (!history || !field) return;
    enqueue({ field, data: currentData, key: currentKey, hint, sealed });
  }

  function clearSyncTimers() {
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    debounceTimer = undefined;
    maxWaitTimer = undefined;
  }

  function scheduleSync() {
    if (!history || closed) return;
    if (!hasUnconfirmed()) {
      clearSyncTimers();
      if (!sending) status.value = 'synced';
      scheduleBufferWrite();
      return;
    }
    if (status.value === 'synced') status.value = 'pending';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void flushSync(), timing.debounceMs);
    maxWaitTimer ??= setTimeout(() => void flushSync(), timing.maxWaitMs);
    scheduleBufferWrite();
  }

  function flushSync() {
    clearSyncTimers();
    enqueueCurrent();
    return send();
  }

  function send(): Promise<void> {
    if (!history) return Promise.resolve();
    if (sending) {
      resendRequested = true;
      return sending;
    }
    clearTimeout(retryTimer);
    sending = (async () => {
      while (queue.length) {
        const write = queue.shift()!;
        inFlight = write;
        status.value = 'saving';
        try {
          const response = await history.transport.sync({
            ...write.field,
            writer,
            data: canonicalizeContentData(write.data),
            ...(write.hint ? { hint: write.hint } : {}),
          });
          ackedKey = write.key;
          lastSyncedAt.value = now();
          retryIndex = 0;
          if (fieldRef.value && isSameField(write.field))
            applyOthers(response.others);
          // The other tabs of this browser offer the draft as it grows.
          announceContentHistoryChange(write.field, 'other-tabs');
        } catch (error) {
          if (!isRefusedWrite(error)) {
            queue.unshift(write);
            inFlight = undefined;
            status.value = 'offline';
            writeBufferNow();
            scheduleRetry();
            return;
          }
          // The server refused this text; nothing sent again would change it.
          ackedKey = write.key;
        } finally {
          inFlight = undefined;
        }
      }
      status.value = currentKey === ackedKey ? 'synced' : 'pending';
      writeBufferNow();
      // Fields behind the editor are told when it closes, not on every write.
    })().finally(() => {
      sending = undefined;
      if (resendRequested) {
        resendRequested = false;
        if (queue.length) void send();
      }
    });
    return sending;
  }

  function scheduleRetry() {
    if (closed) return;
    clearTimeout(retryTimer);
    const delay =
      timing.retryMs[Math.min(retryIndex, timing.retryMs.length - 1)]!;
    retryIndex += 1;
    retryTimer = setTimeout(() => void flushSync(), delay);
  }

  // --- Keeping it in the browser --------------------------------------------

  /**
   * An earlier session of this tab may have left writes of the field the
   * server never confirmed. They are older than anything typed now, so they
   * go out first, in order.
   */
  function takeOverLeftovers() {
    const field = fieldRef.value;
    const left = field && history?.buffer?.read(field, writer);
    if (!field || !left) return;
    queue.unshift(
      ...left.entries.map((entry) => ({
        field,
        data: entry.data,
        key: contentSemanticKey(entry.data),
        hint: entry.hint,
        sealed: true,
      })),
    );
  }

  function scheduleBufferWrite() {
    if (!history?.buffer) return;
    clearTimeout(bufferTimer);
    bufferTimer = setTimeout(writeBufferNow, timing.bufferMs);
  }

  function writeBufferNow() {
    const buffer = history?.buffer;
    const field = fieldRef.value;
    if (!buffer || !field) return;
    clearTimeout(bufferTimer);
    const writes = [...(inFlight ? [inFlight] : []), ...queue];
    if (currentKey !== (writes.at(-1)?.key ?? ackedKey))
      writes.push({ field, data: currentData, key: currentKey });
    if (!writes.length) {
      buffer.remove(field, writer);
      bufferAvailable.value = true;
      return;
    }
    // A buffer entry belongs to one field; writes queued under an earlier
    // address of it are sent before anything else anyway.
    bufferAvailable.value = buffer.write({
      field,
      writer,
      entries: writes.map((write) => ({
        data: canonicalizeContentData(write.data),
        ...(write.hint ? { hint: write.hint } : {}),
      })),
      updatedAt: now(),
    });
  }

  function onHide() {
    if (closed) return;
    writeBufferNow();
    if (hasUnconfirmed()) void flushSync();
  }

  function onOnline() {
    if (closed) return;
    if (hasUnconfirmed()) void flushSync();
    scheduleRefresh();
  }

  // --- Replacing the whole text -----------------------------------------------

  /**
   * Replaces the editor's text: sends the text as it is now, applies the
   * change, then sends the result with a hint so the earlier text is kept.
   */
  async function replace(
    hint: ContentHistoryHint,
    apply: () => Promise<ContentOutputData | void>,
    remember: boolean,
  ) {
    if (destroyed) return false;
    isApplying.value = true;
    changeVersion += 1;
    hasPendingCapture.value = false;
    try {
      await flushCapture();
      const before: EditorHistoryState = { data: currentData, key: currentKey };
      if (history) {
        clearSyncTimers();
        enqueueCurrent(undefined, true);
        void send();
      }
      const applied = await apply();
      if (destroyed) return false;
      const next = applied ?? cleanEditorSnapshot(await options.read());
      setCurrent(next, true);
      if (history) {
        currentStats = contentHistoryStats(currentData);
        enqueueCurrent(hint);
        void send();
        scheduleBufferWrite();
      }
      lastRestore.value =
        remember && before.key !== currentKey ? before : undefined;
      return true;
    } catch (error) {
      options.onError?.(error, 'restore');
      return false;
    } finally {
      isApplying.value = false;
    }
  }

  async function restore(
    data: ContentOutputData,
    restoreOptions: { adoptRef?: string; remember?: boolean } = {},
  ) {
    const clean = cleanEditorSnapshot(data);
    return replace(
      'before-restore',
      async () => {
        if (restoreOptions.adoptRef) moveTo(restoreOptions.adoptRef);
        await options.render(cloneSerializable(clean));
        return clean;
      },
      restoreOptions.remember ?? true,
    );
  }

  /** Goes on writing under another new owner's address, taking its draft up. */
  function moveTo(ownerRef: string) {
    const previous = fieldRef.value;
    if (!previous || previous.ownerRef === ownerRef) return;
    const next = { ...previous, ownerRef };
    activeBufferKeys.delete(contentHistoryBufferKey(previous, writer));
    activeBufferKeys.add(contentHistoryBufferKey(next, writer));
    history?.buffer?.remove(previous, writer);
    fieldRef.value = next;
  }

  /** Puts back the text the last restore replaced. */
  async function undoRestore() {
    const previous = lastRestore.value;
    if (!previous) return false;
    lastRestore.value = undefined;
    return restore(previous.data, { remember: false });
  }

  /** Runs a change that empties the editor, keeping what it held. */
  function clear(action: () => Promise<void>) {
    return replace(
      'before-clear',
      async () => {
        await action();
      },
      false,
    );
  }

  // --- Drafts of other tabs -------------------------------------------------

  /** Drafts other tabs keep of this field, newest first. */
  const others = shallowRef<ContentHistoryEntryMeta[]>([]);
  /** Unsent text another tab left in this browser. */
  const localOffer =
    shallowRef<Extract<EditorHistoryOffer, { kind: 'local' }>>();
  /** Tabs and new owners whose drafts were declined in this session. */
  const declined = shallowRef<ReadonlySet<string>>(new Set());
  const offersLoaded = ref(false);
  let othersVersion = 0;

  /**
   * The draft to offer: the latest one another tab keeps that says something
   * other than the editor does now. It is never applied by itself.
   */
  const offer = computed<EditorHistoryOffer | undefined>(() => {
    const field = fieldRef.value;
    if (!offersLoaded.value || !field) return undefined;
    const digest = currentDigest.value;
    const local = localOffer.value;
    if (local && local.digest !== digest) return local;
    const skip = declined.value;
    const draft = others.value.find(
      (meta) => meta.digest !== digest && !skip.has(`writer:${meta.writer}`),
    );
    const pending = history?.pending?.();
    if (
      pending &&
      pending.ownerRef !== field.ownerRef &&
      pending.digest !== digest &&
      !skip.has(`owner:${pending.ownerRef}`) &&
      (!draft || pending.updatedAt > draft.updatedAt)
    )
      return { kind: 'server', meta: pending, adoptRef: pending.ownerRef };
    return draft && { kind: 'server', meta: draft };
  });

  function isSameField(value: ContentHistoryField) {
    return Boolean(
      fieldRef.value && isSameContentHistoryField(value, fieldRef.value),
    );
  }

  function applyOthers(drafts: ContentHistoryEntryMeta[]) {
    othersVersion += 1;
    others.value = drafts.filter((draft) => draft.writer !== writer);
  }

  /** Asks the server which drafts other tabs keep of the field now. */
  async function refreshOthers() {
    const field = fieldRef.value;
    if (!history || !field || destroyed) return;
    const version = ++othersVersion;
    try {
      const drafts = await history.transport.drafts(
        field.ownerType,
        field.ownerRef,
      );
      // A write answered meanwhile knows better.
      if (version !== othersVersion || destroyed) return;
      applyOthers(drafts.filter((draft) => draft.slot === field.slot));
    } catch {
      // No offer is better than a wrong one; editing goes on regardless.
    }
  }

  function scheduleRefresh() {
    if (!offersLoaded.value || destroyed) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refreshOthers(), timing.refreshMs);
  }

  function onChangeElsewhere(event: Event) {
    const change = (event as CustomEvent<ContentHistoryChange>).detail;
    if (change?.remote && (!change.field || isSameField(change.field)))
      scheduleRefresh();
  }

  /**
   * Looks for drafts this editor should offer: text another tab left
   * unconfirmed in this browser, and the drafts other tabs keep of the field
   * on the server. From then on the offer follows them.
   */
  async function loadOffers() {
    const field = fieldRef.value;
    if (!history || !field) return;
    if (history.buffer) {
      await flushContentHistoryBuffers(
        history.transport,
        history.buffer,
        field,
        locks,
      ).catch(() => 0);
      // A tab still open sends its own text; its draft is offered from the
      // server once it has.
      const live = await locks.live();
      const left = history.buffer
        .list(field)
        .filter((entry) => entry.writer !== writer && !live.has(entry.writer))
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      const data = left?.entries.at(-1)?.data;
      if (left && data && !destroyed)
        localOffer.value = {
          kind: 'local',
          entry: left,
          data,
          digest: contentDigest(data),
          updatedAt: left.updatedAt,
          stats: contentHistoryStats(data),
        };
    }
    await refreshOthers();
    if (!destroyed) offersLoaded.value = true;
  }

  /** The offered draft is declined: it is kept as a version and not offered again. */
  async function dismissOffer() {
    const value = offer.value;
    if (!value || !history) return;
    if (value.kind === 'local') {
      localOffer.value = undefined;
      history.buffer?.remove(value.entry.field, value.entry.writer);
      return;
    }
    declined.value = new Set([
      ...declined.value,
      value.adoptRef
        ? `owner:${value.meta.ownerRef}`
        : `writer:${value.meta.writer}`,
    ]);
    await history.transport.dismiss(value.meta.id).catch(() => undefined);
    announceContentHistoryChange(value.meta);
  }

  /**
   * The offered draft was taken up. The server lets another tab's copy go as
   * soon as this one writes the same text; unsent text left in this browser
   * is let go here.
   */
  function clearOffer(value: EditorHistoryOffer) {
    if (value.kind !== 'local') return;
    localOffer.value = undefined;
    history?.buffer?.remove(value.entry.field, value.entry.writer);
  }

  async function loadOfferData(value: EditorHistoryOffer) {
    if (value.kind === 'local') return { data: value.data, missingAssets: 0 };
    const entry = await fetchEntry(value.meta.id);
    return { data: entry.data, missingAssets: entry.missingAssets };
  }

  function loadHistory(): Promise<ContentHistoryIndexResponse> {
    const field = fieldRef.value;
    if (!history || !field)
      return Promise.resolve({ drafts: [], revisions: [] });
    return history.transport.index(field);
  }

  function fetchEntry(id: string): Promise<ContentHistoryEntryResponse> {
    if (!history) return Promise.reject(new Error('No history'));
    return history.transport.entry(id);
  }

  // --- Ending ---------------------------------------------------------------

  /**
   * Ends the session. What is not confirmed yet is written to the browser at
   * once and then sent; a discarded text is kept as a version on the server,
   * and what the form still holds stays protected as the tab's draft.
   */
  async function close(
    closeOptions: {
      discarded?: boolean;
      replacement?: ContentOutputData | null;
    } = {},
  ) {
    if (closed) return;
    closed = true;
    destroyed = true;
    changeVersion += 1;
    hasPendingCapture.value = false;
    stopTimers();
    const field = fieldRef.value;
    if (!history || !field) return;
    enqueueCurrent();
    writeBufferNow();
    activeBufferKeys.delete(contentHistoryBufferKey(field, writer));
    try {
      await send();
      if (closeOptions.discarded && !queue.length) {
        await history.transport.discard({
          ...field,
          writer,
          replacement: closeOptions.replacement
            ? canonicalizeContentData(closeOptions.replacement)
            : null,
        });
      }
    } catch {
      // What was not sent stays in the browser and goes out next time.
    } finally {
      announceContentHistoryChange(field);
    }
  }

  function stopTimers() {
    clearSyncTimers();
    clearTimeout(bufferTimer);
    clearTimeout(retryTimer);
    clearTimeout(refreshTimer);
    for (const unbind of unbinds.splice(0)) unbind();
  }

  /** Stops everything without sending; for editors that keep no history. */
  function destroy() {
    destroyed = true;
    closed = true;
    changeVersion += 1;
    hasPendingCapture.value = false;
    stopTimers();
    if (fieldRef.value)
      activeBufferKeys.delete(contentHistoryBufferKey(fieldRef.value, writer));
  }

  return {
    writer,
    field: () => fieldRef.value,
    isApplying: readonly(isApplying),
    isPending,
    status: readonly(status),
    lastSyncedAt: readonly(lastSyncedAt),
    offer,
    lastRestore: computed(() => lastRestore.value),
    needsUnloadGuard,
    initialize,
    recordChange,
    synchronize,
    current,
    currentKey: () => currentKey,
    restore,
    undoRestore,
    clear,
    loadOffers,
    dismissOffer,
    clearOffer,
    loadOfferData,
    loadHistory,
    fetchEntry,
    close,
    destroy,
  };
}

export type EditorHistorySession = ReturnType<
  typeof createEditorHistorySession
>;

const browserLifecycle: EditorHistoryLifecycle = {
  onHide(callback) {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') callback();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', callback);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', callback);
    };
  },
  onShow(callback) {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') callback();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', callback);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', callback);
    };
  },
  onOnline(callback) {
    window.addEventListener('online', callback);
    return () => window.removeEventListener('online', callback);
  },
};

/** Groups versions, newest first, under the local day they were written. */
export function groupHistoryByDay<T extends { updatedAt: number }>(
  entries: readonly T[],
): { dayStart: number; entries: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const entry of entries) {
    const date = new Date(entry.updatedAt);
    const dayStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
    const group = groups.get(dayStart);
    if (group) group.push(entry);
    else groups.set(dayStart, [entry]);
  }
  return Array.from(groups, ([dayStart, items]) => ({
    dayStart,
    entries: items.sort((left, right) => right.updatedAt - left.updatedAt),
  })).sort((left, right) => right.dayStart - left.dayStart);
}
