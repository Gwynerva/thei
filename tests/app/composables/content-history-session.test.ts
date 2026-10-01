import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEditorHistorySession,
  type EditorHistoryLifecycle,
} from '../../../app/composables/content-history/session';
import {
  createLocalContentHistoryBuffer,
  flushContentHistoryBuffers,
  forgetBrowserSnapshots,
} from '../../../app/composables/content-history/buffer';
import type { ContentHistoryTransport } from '../../../app/composables/content-history/api';
import { cleanEditorSnapshot } from '../../../app/composables/editor-output';
import { groupHistoryByDay } from '../../../app/composables/content-history/time-labels';
import type { ContentOutputData } from '../../../shared/content';
import {
  contentDigest,
  type ContentHistoryEntryMeta,
  type ContentHistorySyncRequest,
} from '../../../shared/content-history';

const field = {
  ownerType: 'page',
  ownerRef: 'pg-1',
  slot: 'page-body',
} as const;

function text(...paragraphs: string[]): ContentOutputData {
  return {
    blocks: paragraphs.map((value, index) => ({
      id: `b${index}`,
      type: 'paragraph',
      data: { text: value },
    })),
  };
}

function words(count: number) {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(' ');
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function createTransport() {
  const writes: ContentHistorySyncRequest[] = [];
  let offline = false;
  let others: ContentHistoryEntryMeta[] = [];
  const transport: ContentHistoryTransport & {
    writes: typeof writes;
    setOffline(value: boolean): void;
    /** What the server says other tabs keep, answering each write. */
    setOthers(value: ContentHistoryEntryMeta[]): void;
  } = {
    writes,
    setOffline(value) {
      offline = value;
    },
    setOthers(value) {
      others = value;
    },
    sync: vi.fn(async (request) => {
      if (offline) throw new TypeError('Failed to fetch');
      writes.push(structuredClone(request));
      return { draft: null, others };
    }),
    discard: vi.fn(async () => ({ draft: null, others: [] })),
    dismiss: vi.fn(async () => undefined),
    index: vi.fn(async () => ({ drafts: [], revisions: [] })),
    entry: vi.fn(async () => {
      throw new Error('not used');
    }),
    drafts: vi.fn(async () => []),
  };
  return transport;
}

function createLifecycle() {
  const hide = new Set<() => void>();
  const show = new Set<() => void>();
  const online = new Set<() => void>();
  const lifecycle: EditorHistoryLifecycle & {
    hide(): void;
    show(): void;
    online(): void;
  } = {
    onHide: (callback) => {
      hide.add(callback);
      return () => hide.delete(callback);
    },
    onShow: (callback) => {
      show.add(callback);
      return () => show.delete(callback);
    },
    onOnline: (callback) => {
      online.add(callback);
      return () => online.delete(callback);
    },
    hide: () => hide.forEach((callback) => callback()),
    show: () => show.forEach((callback) => callback()),
    online: () => online.forEach((callback) => callback()),
  };
  return lifecycle;
}

function setup(
  initial: ContentOutputData = text('Opened'),
  options: {
    buffer?: ReturnType<typeof createLocalContentHistoryBuffer>;
    pending?: () => ContentHistoryEntryMeta | undefined;
  } = {},
) {
  let editorData = structuredClone(initial);
  const transport = createTransport();
  const storage = createStorage();
  const buffer =
    options.buffer ?? createLocalContentHistoryBuffer('/', () => storage);
  const lifecycle = createLifecycle();
  const events = new EventTarget();
  const keys: string[] = [];
  const session = createEditorHistorySession({
    read: async () => structuredClone(editorData),
    render: async (data) => {
      editorData = structuredClone(data);
    },
    onCurrentChange: (state) => keys.push(state.key),
    history: { field, transport, buffer, pending: options.pending },
    writer: 'tab-1',
    lifecycle,
    events,
  });
  return {
    session,
    transport,
    buffer,
    storage,
    lifecycle,
    keys,
    /** Another tab of this browser says it wrote a draft of the field. */
    otherTabWrote(target: typeof field = field) {
      events.dispatchEvent(
        new CustomEvent('change', { detail: { field: target, remote: true } }),
      );
    },
    type(data: ContentOutputData) {
      editorData = structuredClone(data);
      session.recordChange();
    },
    editor: () => editorData,
  };
}

function otherDraft(
  overrides: Partial<ContentHistoryEntryMeta> = {},
): ContentHistoryEntryMeta {
  return {
    id: 'ch-other',
    ...field,
    kind: 'draft',
    digest: 'other',
    writer: 'tab-2',
    wordCount: 3,
    blockCount: 1,
    assetCount: 0,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function sentTexts(transport: ReturnType<typeof createTransport>) {
  return transport.writes.map((write) => ({
    text: write.data.blocks.map((block) => block.data.text).join('|'),
    hint: write.hint,
  }));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('editor history session', () => {
  it('says so when the server refuses a draft, and tries again on the next change', async () => {
    const { session, transport, type } = setup();
    await session.initialize();
    vi.mocked(transport.sync).mockRejectedValueOnce(
      Object.assign(new Error('Too large'), { statusCode: 413 }),
    );
    type(text('Too much to keep'));
    await vi.advanceTimersByTimeAsync(10_000);
    // Not kept, and not sent again as it is: nothing would change.
    expect(session.status.value).toBe('refused');
    expect(transport.sync).toHaveBeenCalledTimes(1);

    type(text('Shorter'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sentTexts(transport)).toEqual([
      { text: 'Shorter', hint: undefined },
    ]);
    expect(session.status.value).toBe('synced');
  });

  it('leaves what an earlier session left when closed before it read the editor', async () => {
    const storage = createStorage();
    const buffer = createLocalContentHistoryBuffer('/', () => storage);
    buffer.write({
      field,
      writer: 'tab-1',
      entries: [{ data: text('Written offline before') }],
      updatedAt: 1,
    });
    const { session } = setup(text('Opened'), { buffer });
    await session.close();
    expect(buffer.read(field, 'tab-1')?.entries[0]?.data).toEqual(
      text('Written offline before'),
    );
  });

  it('writes nothing for the text it opened with', async () => {
    const { session, transport } = setup();
    await session.initialize();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.sync).not.toHaveBeenCalled();
    expect(session.status.value).toBe('synced');
  });

  it('sends the draft once typing pauses, and at the latest every ten seconds', async () => {
    const { session, transport, type } = setup();
    await session.initialize();

    type(text('One'));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(transport.sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sentTexts(transport)).toEqual([{ text: 'One', hint: undefined }]);

    // Typing that never pauses for two seconds still reaches the server.
    for (let second = 1; second <= 10; second++) {
      type(text(`Two ${second}`));
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(transport.writes.length).toBe(2);
    expect(session.status.value).not.toBe('offline');
  });

  it('never sends the same text twice', async () => {
    const { session, transport, type } = setup();
    await session.initialize();
    type(text('Same'));
    await vi.advanceTimersByTimeAsync(3_000);
    // Only block ids changed: the same text.
    type({
      blocks: [{ id: 'other', type: 'paragraph', data: { text: 'Same' } }],
    });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(transport.writes).toHaveLength(1);
  });

  it('sends the text before a large deletion as it was, at once', async () => {
    const { session, transport, type } = setup(text(words(200)));
    await session.initialize();
    type(text(`${words(200)} more`));
    await vi.advanceTimersByTimeAsync(500);
    type(text('Almost nothing'));
    await vi.advanceTimersByTimeAsync(0);

    expect(sentTexts(transport).map((write) => write.text)).toEqual([
      `${words(200)} more`,
      'Almost nothing',
    ]);
  });

  it('keeps the text before a restore and offers to undo it', async () => {
    const { session, transport, type, editor } = setup();
    await session.initialize();
    type(text('Current work'));
    await vi.advanceTimersByTimeAsync(500);

    expect(await session.restore(text('Old version'))).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sentTexts(transport)).toEqual([
      { text: 'Current work', hint: undefined },
      { text: 'Old version', hint: 'before-restore' },
    ]);
    expect(session.lastRestore.value?.data.blocks[0]?.data.text).toBe(
      'Current work',
    );

    await session.undoRestore();
    expect(editor().blocks[0]?.data.text).toBe('Current work');
    expect(session.lastRestore.value).toBeUndefined();
  });

  it('does no background work while a restore renders', async () => {
    let finishRender!: () => void;
    const reads = vi.fn();
    let editorData = text('Before');
    const transport = createTransport();
    const session = createEditorHistorySession({
      read: async () => {
        reads();
        return structuredClone(editorData);
      },
      render: (data) =>
        new Promise<void>((resolve) => {
          finishRender = () => {
            editorData = structuredClone(data);
            resolve();
          };
        }),
      history: { field, transport },
      lifecycle: createLifecycle(),
    });
    await session.initialize();
    const restoring = session.restore(text('Restored'));
    await vi.advanceTimersByTimeAsync(0);
    const readsBefore = reads.mock.calls.length;
    session.recordChange();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads.mock.calls.length).toBe(readsBefore);
    finishRender();
    expect(await restoring).toBe(true);
  });

  it('keeps what the editor held before clearing it', async () => {
    const { session, transport, editor } = setup(text('Precious'));
    await session.initialize();
    await session.clear(async () => {
      Object.assign(editor(), { blocks: [] });
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.writes.at(-1)?.hint).toBe('before-clear');
  });

  it('keeps unconfirmed text in the browser and sends it when the connection returns', async () => {
    const { session, transport, buffer, lifecycle, type } = setup();
    await session.initialize();
    transport.setOffline(true);
    type(text('Written offline'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(session.status.value).toBe('offline');
    expect(
      buffer.read(field, 'tab-1')?.entries.at(-1)?.data.blocks[0]?.data.text,
    ).toBe('Written offline');

    transport.setOffline(false);
    lifecycle.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentTexts(transport)).toEqual([
      { text: 'Written offline', hint: undefined },
    ]);
    expect(buffer.read(field, 'tab-1')).toBeUndefined();
    expect(session.status.value).toBe('synced');
  });

  it('writes the latest text to the browser at once when the page is hidden', async () => {
    const { session, buffer, lifecycle, type, transport } = setup();
    await session.initialize();
    transport.setOffline(true);
    type(text('Typed just before closing'));
    await vi.advanceTimersByTimeAsync(0);
    lifecycle.hide();
    expect(
      buffer.read(field, 'tab-1')?.entries.at(-1)?.data.blocks[0]?.data.text,
    ).toBe('Typed just before closing');
  });

  it('takes away the snapshots of releases before, and nothing else', () => {
    const storage = createStorage();
    storage.setItem('thei:content-editor-snapshots:v2:content:c-1', '[]');
    storage.setItem('thei:content-editor-snapshots:v2:new:x', '[]');
    storage.setItem('thei:content-unsynced:/:page:pg-1:page-body:tab', '{}');
    storage.setItem('theme', 'dark');
    forgetBrowserSnapshots(() => storage);
    expect([...Array(storage.length)].map((_, i) => storage.key(i))).toEqual([
      'thei:content-unsynced:/:page:pg-1:page-body:tab',
      'theme',
    ]);
  });

  it('sends what an earlier session left in the browser', async () => {
    const storage = createStorage();
    const buffer = createLocalContentHistoryBuffer('/', () => storage);
    buffer.write({
      field,
      writer: 'crashed-tab',
      entries: [{ data: text('Left behind') }],
      updatedAt: 1,
    });
    const transport = createTransport();
    expect(await flushContentHistoryBuffers(transport, buffer)).toBe(0);
    expect(transport.writes[0]).toMatchObject({ writer: 'crashed-tab' });
    expect(buffer.list()).toEqual([]);
  });

  it('keeps a discarded text on the server and protects the form value', async () => {
    const { session, transport, type } = setup();
    await session.initialize();
    type(text('Discarded work'));
    await vi.advanceTimersByTimeAsync(0);
    await session.close({ discarded: true, replacement: text('Form value') });
    expect(sentTexts(transport).at(-1)?.text).toBe('Discarded work');
    expect(transport.discard).toHaveBeenCalledWith(
      expect.objectContaining({
        writer: 'tab-1',
        replacement: expect.objectContaining({
          blocks: [expect.objectContaining({ data: { text: 'Form value' } })],
        }),
      }),
    );
  });

  it('offers the draft another tab keeps, and never its own', async () => {
    const { session, transport } = setup();
    vi.mocked(transport.drafts).mockResolvedValue([
      otherDraft({ writer: 'tab-1', digest: 'mine', updatedAt: 3 }),
      otherDraft(),
    ]);
    await session.initialize();
    await session.loadOffers();
    expect(session.offer.value).toMatchObject({
      kind: 'server',
      meta: { id: 'ch-other' },
    });

    await session.dismissOffer();
    expect(transport.dismiss).toHaveBeenCalledWith('ch-other');
    expect(session.offer.value).toBeUndefined();
  });

  it('follows the drafts of other tabs as they change', async () => {
    const { session, transport, lifecycle, otherTabWrote, type } = setup();
    await session.initialize();
    await session.loadOffers();
    expect(session.offer.value).toBeUndefined();

    // Another tab of this browser writes: the offer appears.
    vi.mocked(transport.drafts).mockResolvedValue([otherDraft()]);
    otherTabWrote();
    await vi.advanceTimersByTimeAsync(300);
    expect(session.offer.value).toMatchObject({ meta: { updatedAt: 2 } });

    // It goes on writing on another device; this tab learns when shown.
    vi.mocked(transport.drafts).mockResolvedValue([
      otherDraft({ digest: 'newer', updatedAt: 5 }),
    ]);
    lifecycle.show();
    await vi.advanceTimersByTimeAsync(300);
    expect(session.offer.value).toMatchObject({ meta: { updatedAt: 5 } });

    // Every write of this tab brings the other drafts along too.
    transport.setOthers([otherDraft({ digest: 'latest', updatedAt: 9 })]);
    type(text('Mine'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(session.offer.value).toMatchObject({ meta: { updatedAt: 9 } });

    // A draft saying what this editor says offers nothing.
    transport.setOthers([
      otherDraft({ digest: contentDigest(text('Same')), updatedAt: 10 }),
    ]);
    type(text('Same'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(session.offer.value).toBeUndefined();
  });

  it('offers no more drafts of a tab it declined', async () => {
    const { session, transport, otherTabWrote } = setup();
    vi.mocked(transport.drafts).mockResolvedValue([otherDraft()]);
    await session.initialize();
    await session.loadOffers();
    await session.dismissOffer();

    vi.mocked(transport.drafts).mockResolvedValue([
      otherDraft({ id: 'ch-next', digest: 'more', updatedAt: 5 }),
    ]);
    otherTabWrote();
    await vi.advanceTimersByTimeAsync(300);
    expect(session.offer.value).toBeUndefined();
  });

  it('takes up the draft of another new owner under its address', async () => {
    const pending = otherDraft({
      ownerRef: 'new~0f8fad5b-d9cb-469f-a165-70867728950e',
    });
    const { session, transport } = setup(text('Opened'), {
      pending: () => pending,
    });
    await session.initialize();
    await session.loadOffers();
    const offer = session.offer.value;
    expect(offer).toMatchObject({ adoptRef: pending.ownerRef });

    await session.restore(text('Pending text'), {
      adoptRef: pending.ownerRef,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.writes.at(-1)).toMatchObject({
      ownerRef: pending.ownerRef,
      hint: 'before-restore',
    });
    // Its own address now: the draft is no longer another owner's.
    expect(session.offer.value).toBeUndefined();
  });

  it('sends first what an earlier editor of this tab left unsent', async () => {
    const storage = createStorage();
    const buffer = createLocalContentHistoryBuffer('/', () => storage);
    buffer.write({
      field,
      writer: 'tab-1',
      entries: [{ data: text('Left unsent') }],
      updatedAt: 1,
    });
    const { session, transport, type } = setup(text('Opened'), { buffer });
    await session.initialize();
    type(text('Typed now'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sentTexts(transport).map((write) => write.text)).toEqual([
      'Left unsent',
      'Typed now',
    ]);
    expect(buffer.read(field, 'tab-1')).toBeUndefined();
  });

  it('reports each real change once and nothing after it is closed', async () => {
    const { session, transport, type, keys } = setup();
    await session.initialize();
    const initialChanges = keys.length;
    type(text('Change'));
    await vi.advanceTimersByTimeAsync(0);
    type(text('Change'));
    await vi.advanceTimersByTimeAsync(0);
    expect(keys.length - initialChanges).toBe(1);

    await session.close();
    const sent = transport.writes.length;
    type(text('Too late'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.writes.length).toBe(sent);
  });

  it('works without history for editors that keep none', async () => {
    let editorData = text('Plain');
    const session = createEditorHistorySession({
      read: async () => structuredClone(editorData),
      render: async (data) => {
        editorData = structuredClone(data);
      },
    });
    await session.initialize();
    expect(session.status.value).toBe('off');
    expect(await session.restore(text('Other'))).toBe(true);
    expect(editorData.blocks[0]?.data.text).toBe('Other');
    session.destroy();
  });
});

describe('history list', () => {
  it('groups versions, newest first, under the local day they were written', () => {
    const late = new Date(2026, 7, 12, 23, 55).getTime();
    const early = new Date(2026, 7, 12, 8, 5).getTime();
    const before = new Date(2026, 7, 11, 18, 30).getTime();
    const groups = groupHistoryByDay(
      [early, before, late].map((updatedAt) => ({ updatedAt })),
    );
    expect(groups.map((group) => group.dayStart)).toEqual([
      new Date(2026, 7, 12).getTime(),
      new Date(2026, 7, 11).getTime(),
    ]);
    expect(groups[0]!.entries.map((entry) => entry.updatedAt)).toEqual([
      late,
      early,
    ]);
  });
});

describe('editor output', () => {
  it('drops Editor.js service fields and keeps the stretch media layout', () => {
    expect(
      cleanEditorSnapshot({
        time: 1,
        version: '2.31.6',
        blocks: [
          {
            id: 'media',
            type: 'contentMedia',
            data: { layout: 'stretch', asset: { assetUuid: 'asset' } },
          },
        ],
      }),
    ).toEqual({
      blocks: [
        {
          id: 'media',
          type: 'contentMedia',
          data: { layout: 'stretch', asset: { assetUuid: 'asset' } },
        },
      ],
    });
  });
});
