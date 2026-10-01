import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import { baselineSql } from '../../update/migrations';
import {
  discardContentDraft,
  dismissContentDraft,
  findHistoryEntry,
  historyEntryMeta,
  listOwnerDrafts,
  readFieldHistory,
  runContentHistoryMaintenance,
  syncContentDraft,
} from '../../server/thei/content/history';
import { applyPreparedContentSave } from '../../server/thei/content/repository';
import { findOrphanedAssets } from '../../server/thei/assets/repository/find-orphaned';
import {
  canonicalizeContentData,
  extractContentAssetRefs,
  normalizeContentData,
  summarizeContentData,
  type ContentOutputBlock,
  type ContentOutputData,
} from '../../shared/content';
import {
  CONTENT_HISTORY_REVISION_TTL_MS,
  contentDigest,
  type ContentHistoryField,
} from '../../shared/content-history';
import { diffContentBlocks } from '../../shared/content-diff';
import {
  createEditorHistorySession,
  type EditorHistoryLifecycle,
} from '../../app/composables/content-history/session';
import type { ContentHistoryTransport } from '../../app/composables/content-history/api';
import {
  createLocalContentHistoryBuffer,
  flushContentHistoryBuffers,
  type ContentHistoryWriterLocks,
} from '../../app/composables/content-history/buffer';

/**
 * Whole stories of writing one long article with every kind of block: the
 * connection drops, a tab dies, two tabs write at once, a change is regretted
 * the next day. The server's rules run for real on an in-memory database;
 * the editors are real sessions, and only the network between them is made
 * up, so it can be cut.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = Date.UTC(2026, 8, 28, 7, 0);
const PAGE = 'pg-elbrus';
const field: ContentHistoryField = {
  ownerType: 'page',
  ownerRef: PAGE,
  slot: 'page-body',
};
const FILES = ['a-cover', 'a-g1', 'a-g2', 'a-g3', 'a-file'];

let rawDb: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  db = drizzle(rawDb, { schema });
  Object.assign(globalThis, {
    THEI_SERVER: { useDb: () => ({ db, schema, rawDb }) },
  });
  for (const assetUuid of FILES)
    rawDb
      .prepare(
        `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt)
         VALUES (?, ?, 'webp', ?, ?, 'k', '{}', 'image', 10, 0)`,
      )
      .run(assetUuid, assetUuid, assetUuid, assetUuid);
});

afterEach(() => {
  for (const tab of openTabs.splice(0)) tab.session.destroy();
  vi.useRealTimers();
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
});

// --- The article ----------------------------------------------------------

const p = (id: string, text: string): ContentOutputBlock => ({
  id,
  type: 'paragraph',
  data: { text },
});
const item = (content: string, items: unknown[] = [], meta = {}) => ({
  content,
  meta,
  items,
});
const media = (assetUuid: string) => ({ assetUuid });

const DAYS = [
  'Утром мы поднялись к скалам Пастухова и вернулись к обеду.',
  'Днём шёл снег, и мы сидели в бочке, играя в карты.',
  'Вечером познакомились с группой из Новосибирска.',
  'Ночью ветер так трепал бочку, что никто не спал.',
  'Утром солнце, и мы поднялись до четырёх тысяч восьмисот.',
  'Отдыхали, сушили ботинки, слушали прогноз по рации.',
  'Прогноз обещал окно в погоде на послезавтра.',
  'Собрали рюкзаки заранее и легли спать в семь вечера.',
  'Проверили кошки, фонари и запас воды на всех.',
  'Гид ещё раз объяснил, где на полке опасные трещины.',
  'Выпили по кружке горячего чая с лимоном и уснули.',
  'Будильник прозвенел в час ночи, и начался главный день.',
];

/** The saved article: about fifty blocks of every kind. */
function articleA(): ContentOutputData {
  return {
    blocks: [
      {
        id: 'h-title',
        type: 'header',
        data: { text: 'Восхождение на Эльбрус', level: 2 },
      },
      p(
        'p-intro',
        'Мы вышли из Терскола в пять утра, когда над ущельем ещё висел туман.',
      ),
      p(
        'p-accl',
        'Первый день ушёл на акклиматизацию: подъём до станции Мир и спуск в посёлок.',
      ),
      {
        id: 'm-cover',
        type: 'contentMedia',
        data: {
          asset: media('a-cover'),
          layout: 'centered',
          caption: 'Вид на седловину с приюта',
        },
      },
      { id: 'h-gear', type: 'header', data: { text: 'Снаряжение', level: 3 } },
      {
        id: 'l-gear',
        type: 'list',
        data: {
          style: 'unordered',
          meta: {},
          items: [
            item('Кошки и ледоруб'),
            item('Пуховка на случай ветра', [item('Запасные перчатки')]),
            item('Налобный фонарь'),
          ],
        },
      },
      {
        id: 'l-plan',
        type: 'list',
        data: {
          style: 'ordered',
          meta: { start: 1, counterType: 'numeric' },
          items: [
            item('Выход в два ночи'),
            item('Косая полка'),
            item('Вершина к девяти'),
          ],
        },
      },
      {
        id: 'l-check',
        type: 'list',
        data: {
          style: 'checklist',
          meta: {},
          items: [
            item('Страховка оформлена', [], { checked: true }),
            item('Гид подтвердил', [], { checked: false }),
          ],
        },
      },
      {
        id: 'q-guide',
        type: 'quote',
        data: {
          text: 'Гора не любит спешки.',
          caption: 'Инструктор Саша',
          alignment: 'left',
        },
      },
      { id: 'd-1', type: 'delimiter', data: {} },
      {
        id: 'g-days',
        type: 'contentGallery',
        data: {
          items: [
            { id: 'i-dawn', asset: media('a-g1'), caption: 'Рассвет' },
            { id: 'i-camp', asset: media('a-g2'), caption: 'Лагерь на скалах' },
          ],
        },
      },
      ...DAYS.map((text, index) => p(`p-day-${index + 1}`, text)),
      p(
        'p-summit',
        'На вершине было минус двадцать и такой ветер, что говорить приходилось знаками.',
      ),
      p(
        'p-descent',
        'Спуск занял вдвое меньше времени, но колени запомнили его надолго.',
      ),
      {
        id: 'f-track',
        type: 'contentAttachment',
        data: {
          asset: media('a-file'),
          title: 'Трек маршрута',
          caption: 'GPX',
        },
      },
      {
        id: 'e-route',
        type: 'externalLink',
        data: { url: 'https://example.com/elbrus/route' },
      },
      {
        id: 'y-video',
        type: 'integration',
        data: { provider: 'youtube', videoId: 'dQw4w9WgXcQ' },
      },
      {
        id: 'el-project',
        type: 'entityLink',
        data: { entityType: 'project', entityId: 'pr-elbrus' },
      },
      {
        id: 's-start',
        type: 'privateSectionBoundary',
        data: { sectionId: 'money', edge: 'start' },
      },
      p('p-money', 'Гид обошёлся в сорок тысяч, и это того стоило.'),
      {
        id: 's-end',
        type: 'privateSectionBoundary',
        data: { sectionId: 'money', edge: 'end' },
      },
      {
        ...p('p-spoiler', 'На обратном пути мы потеряли палатку.'),
        tunes: { spoiler: true },
      },
      p('p-thanks', 'Спасибо всем, кто шёл рядом.'),
      { id: 'd-2', type: 'delimiter', data: {} },
      p('p-next', 'В следующем году — Казбек.'),
    ],
  };
}

type Blocks = ContentOutputBlock[];

function change(
  id: string,
  update: (block: ContentOutputBlock) => ContentOutputBlock,
) {
  return (blocks: Blocks) =>
    blocks.map((block) =>
      block.id === id ? update(structuredClone(block)) : block,
    );
}
const retext = (id: string, from: string, to: string) =>
  change(id, (block) => ({
    ...block,
    data: { ...block.data, text: String(block.data.text).replace(from, to) },
  }));
const remove = (id: string) => (blocks: Blocks) =>
  blocks.filter((block) => block.id !== id);
const insert =
  (at: string, block: ContentOutputBlock, where: 'before' | 'after') =>
  (blocks: Blocks) =>
    blocks.flatMap((current) =>
      current.id !== at
        ? [current]
        : where === 'before'
          ? [block, current]
          : [current, block],
    );

/**
 * The edits that turn the saved article into its second version, in the
 * order they are typed. Every kind of block is changed by one of them.
 */
const EDITS: ((blocks: Blocks) => Blocks)[] = [
  retext('h-title', 'Эльбрус', 'Эльбрус с юга'),
  insert(
    'p-intro',
    p('p-plan', 'Эту поездку мы планировали два года.'),
    'before',
  ),
  retext('p-intro', 'пять утра', 'четыре утра'),
  remove('p-accl'),
  // --- the connection drops here in the first story
  change('m-cover', (block) => ({
    ...block,
    data: {
      ...block.data,
      caption: 'Вид на седловину на рассвете',
      layout: 'stretch',
    },
  })),
  change('l-gear', (block) => {
    const items = structuredClone(block.data.items) as any[];
    items[1].items[0].content = 'Запасные перчатки и носки';
    items.push(item('Термос'));
    return { ...block, data: { ...block.data, items } };
  }),
  change('g-days', (block) => ({
    ...block,
    data: {
      items: [
        { id: 'i-dawn', asset: media('a-g1'), caption: 'Рассвет' },
        { id: 'i-camp', asset: media('a-g3'), caption: 'Лагерь под скалами' },
      ],
    },
  })),
  // --- the tab dies here
  retext('p-summit', ' и такой ветер, что говорить приходилось знаками', ''),
  insert(
    'p-summit',
    p('p-wind', 'Ветер был такой, что говорить приходилось знаками.'),
    'after',
  ),
  retext('p-money', 'сорок', 'сорок пять'),
  change('p-spoiler', ({ tunes: _tunes, ...block }) => block),
  // --- the rest of the second version
  change('l-check', (block) => {
    const items = structuredClone(block.data.items) as any[];
    items[1].meta.checked = true;
    return { ...block, data: { ...block.data, items } };
  }),
  change('q-guide', (block) => ({
    ...block,
    data: { ...block.data, caption: 'Александр, наш инструктор' },
  })),
  change('f-track', (block) => ({
    ...block,
    data: { ...block.data, title: 'Трек маршрута с часов' },
  })),
  change('e-route', (block) => ({
    ...block,
    data: { url: 'https://example.com/elbrus/south-route' },
  })),
  change('y-video', (block) => ({
    ...block,
    data: { ...block.data, start: 90 },
  })),
  change('el-project', (block) => ({
    ...block,
    data: { entityType: 'event', entityId: 'ev-summit-day' },
  })),
  remove('p-day-7'),
  retext('p-day-8', 'легли спать в семь вечера', 'легли спать в шесть'),
  (blocks) => {
    const thanks = blocks.find((block) => block.id === 'p-thanks')!;
    return [...blocks.filter((block) => block !== thanks), thanks];
  },
  (blocks) => [...blocks, p('p-ps', 'P.S. Фотографии скоро будут в галерее.')],
];

/** The article after the first `count` edits; all of them by default. */
function edited(count = EDITS.length): ContentOutputData {
  let blocks = articleA().blocks;
  for (const apply of EDITS.slice(0, count)) blocks = apply(blocks);
  return { blocks };
}
const articleB = () => edited();

// --- The server, the network and the tabs --------------------------------

function saveArticle(data: ContentOutputData) {
  const canonical = canonicalizeContentData(data);
  const refs = new Map<string, any[]>();
  for (const ref of extractContentAssetRefs(canonical))
    refs.set(ref.assetUuid, [...(refs.get(ref.assetUuid) ?? []), ref]);
  const summary = summarizeContentData(canonical);
  db.transaction((tx) =>
    applyPreparedContentSave(tx, schema, 'page', PAGE, 'page-body', {
      type: 'save',
      contentUuid: 'c-elbrus',
      changed: true,
      data: canonical,
      blockCount: summary.blockCount,
      wordCount: summary.wordCount,
      assetCount: summary.assetCount,
      assetTotalSize: 0,
      assetUsages: [...refs].map(([assetUuid, list]) => ({
        assetUuid,
        contentUuid: 'c-elbrus',
        meta: { role: 'content', refs: list, isPrivate: false },
      })),
    }),
  );
}

const network = { online: true };

interface Browser {
  storage: Storage;
  tabs: Tab[];
  /** The tabs open, by writer, as the browser's Web Locks keep them. */
  locks: ContentHistoryWriterLocks & { close(writer: string): void };
}

function createLocks(): Browser['locks'] {
  const open = new Set<string>();
  const sending = new Set<string>();
  return {
    hold: (writer) => void open.add(writer),
    async whileIdle(writer, send) {
      if (open.has(writer) || sending.has(writer)) return false;
      sending.add(writer);
      try {
        await send();
      } finally {
        sending.delete(writer);
      }
      return true;
    },
    live: async () => new Set(open),
    close: (writer) => void open.delete(writer),
  };
}

function createBrowser(): Browser {
  const values = new Map<string, string>();
  return {
    tabs: [],
    locks: createLocks(),
    storage: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => void values.delete(key),
      setItem: (key, value) => void values.set(key, value),
    },
  };
}

/** A request reaching the server, answered as JSON would carry it. */
async function request<T>(
  browser: Browser,
  from: Tab | undefined,
  run: () => T,
) {
  if (!network.online) throw new TypeError('Failed to fetch');
  const result = structuredClone(run());
  // The other tabs of the browser hear of it, as over a BroadcastChannel.
  for (const tab of browser.tabs)
    if (tab !== from)
      tab.events.dispatchEvent(
        new CustomEvent('change', { detail: { field, remote: true } }),
      );
  return result;
}

function transportFor(browser: Browser, tab?: Tab): ContentHistoryTransport {
  const read = <T>(run: () => T) =>
    network.online
      ? Promise.resolve(structuredClone(run()))
      : Promise.reject(new TypeError('Failed to fetch'));
  return {
    sync: (body) =>
      request(browser, tab, () => syncContentDraft(body, Date.now())),
    discard: (body) =>
      request(browser, tab, () => discardContentDraft(body, Date.now())),
    dismiss: async (id) => {
      await request(browser, tab, () => dismissContentDraft(id, Date.now()));
    },
    index: (target) => read(() => readFieldHistory(target)),
    entry: (id) =>
      read(() => {
        const row = findHistoryEntry(id);
        if (!row) throw new Error('Not found');
        const missing = row.assetUuids.filter(
          (assetUuid) =>
            !db
              .select()
              .from(schema.assets)
              .where(eq(schema.assets.assetUuid, assetUuid))
              .get(),
        );
        return {
          entry: historyEntryMeta(row),
          data: row.data,
          missingAssets: missing.length,
        };
      }),
    drafts: (ownerType, ownerRef) =>
      read(() => listOwnerDrafts(ownerType, ownerRef)),
  };
}

interface Tab {
  session: ReturnType<typeof createEditorHistorySession>;
  events: EventTarget;
  lifecycle: EditorHistoryLifecycle & {
    hide(): void;
    show(): void;
    online(): void;
  };
  text(): ContentOutputData;
  write(data: ContentOutputData): Promise<void>;
}

const openTabs: Tab[] = [];

function createLifecycle() {
  const listeners = {
    hide: new Set<() => void>(),
    show: new Set<() => void>(),
    online: new Set<() => void>(),
  };
  const on = (kind: keyof typeof listeners) => (callback: () => void) => {
    listeners[kind].add(callback);
    return () => listeners[kind].delete(callback);
  };
  return {
    onHide: on('hide'),
    onShow: on('show'),
    onOnline: on('online'),
    hide: () => listeners.hide.forEach((callback) => callback()),
    show: () => listeners.show.forEach((callback) => callback()),
    online: () => listeners.online.forEach((callback) => callback()),
  };
}

/** Opens the editor on what is saved, in a tab of the browser. */
async function openTab(browser: Browser, writer: string): Promise<Tab> {
  const saved = db
    .select()
    .from(schema.content)
    .where(eq(schema.content.ownerId, PAGE))
    .get();
  let data = structuredClone(
    saved?.data ?? { blocks: [] },
  ) as ContentOutputData;
  const tab = {
    events: new EventTarget(),
    lifecycle: createLifecycle(),
    text: () => data,
  } as Tab;
  tab.session = createEditorHistorySession({
    read: async () => structuredClone(data),
    render: async (next) => {
      data = structuredClone(next);
    },
    history: {
      field,
      transport: transportFor(browser, tab),
      buffer: createLocalContentHistoryBuffer('/', () => browser.storage),
      locks: browser.locks,
    },
    writer,
    lifecycle: tab.lifecycle,
    events: tab.events,
  });
  // A session destroyed here is a tab gone, and the browser lets its lock go.
  const destroy = tab.session.destroy;
  tab.session.destroy = () => {
    destroy();
    browser.locks.close(writer);
  };
  tab.write = async (next) => {
    data = structuredClone(next);
    tab.session.recordChange();
    await vi.advanceTimersByTimeAsync(0);
  };
  browser.tabs.push(tab);
  openTabs.push(tab);
  await tab.session.initialize();
  await tab.session.loadOffers();
  return tab;
}

/** Lets the editors send what they hold and the other tabs hear of it. */
async function settle() {
  await vi.advanceTimersByTimeAsync(10_000);
}

function drafts() {
  return readFieldHistory(field).drafts;
}

function revisions() {
  return readFieldHistory(field).revisions;
}

function describeDiff(current: ContentOutputData, version: ContentOutputData) {
  return diffContentBlocks(
    normalizeContentData(current),
    normalizeContentData(version),
  ).map((entry) => {
    const id = entry.kind === 'changed' ? entry.previous.id : entry.block.id;
    if (entry.kind !== 'changed') return `${entry.kind}:${id}`;
    return entry.words ? `rewritten:${id}` : `changed:${id}`;
  });
}

beforeEach(() => {
  network.online = true;
});

// --- The stories -----------------------------------------------------------

describe('two versions of a long article', () => {
  it('differ block by block, whatever else changed around each block', () => {
    expect(describeDiff(articleA(), articleB())).toEqual([
      'rewritten:h-title',
      'added:p-plan',
      'rewritten:p-intro',
      'removed:p-accl',
      'changed:m-cover',
      'same:h-gear',
      'rewritten:l-gear',
      'same:l-plan',
      // A box ticked: the words are the same, the list is not.
      'changed:l-check',
      'rewritten:q-guide',
      'same:d-1',
      'changed:g-days',
      'same:p-day-1',
      'same:p-day-2',
      'same:p-day-3',
      'same:p-day-4',
      'same:p-day-5',
      'same:p-day-6',
      'removed:p-day-7',
      'rewritten:p-day-8',
      'same:p-day-9',
      'same:p-day-10',
      'same:p-day-11',
      'same:p-day-12',
      'rewritten:p-summit',
      'added:p-wind',
      'same:p-descent',
      'changed:f-track',
      'changed:e-route',
      'changed:y-video',
      'changed:el-project',
      'same:s-start',
      'rewritten:p-money',
      'same:s-end',
      'changed:p-spoiler',
      'removed:p-thanks',
      'same:d-2',
      'same:p-next',
      'added:p-thanks',
      'added:p-ps',
    ]);
  });

  it('read the same the other way round, with what goes and comes swapped', () => {
    const forward = describeDiff(articleA(), articleB());
    const backward = describeDiff(articleB(), articleA());
    const swap = (line: string) =>
      line.replace(/^(removed|added)/, (kind) =>
        kind === 'removed' ? 'added' : 'removed',
      );
    expect(backward.filter((line) => !line.includes('p-thanks'))).toEqual(
      forward.filter((line) => !line.includes('p-thanks')).map(swap),
    );
  });

  it('show the words of a paragraph rewritten right after one written in', () => {
    const intro = diffContentBlocks(articleA(), articleB()).find(
      (entry) => entry.kind === 'changed' && entry.block.id === 'p-intro',
    );
    expect(intro).toMatchObject({
      words: [
        { kind: 'same', text: 'Мы вышли из Терскола в ' },
        { kind: 'removed', text: 'пять' },
        { kind: 'added', text: 'четыре' },
        { kind: 'same', text: ' утра, когда над ущельем ещё висел туман.' },
      ],
    });
  });
});

describe('writing a long article', () => {
  it('survives a lost connection and a tab that dies before it returns', async () => {
    saveArticle(articleA());
    const laptop = createBrowser();
    const first = await openTab(laptop, 'tab-first');

    // Online: the first edits reach the server within seconds.
    await first.write(edited(4));
    await settle();
    expect(drafts().map((draft) => draft.digest)).toEqual([
      contentDigest(edited(4)),
    ]);

    // The connection drops; writing goes on for a quarter of an hour.
    network.online = false;
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    await first.write(edited(7));
    await settle();
    expect(first.session.status.value).toBe('offline');
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    await first.write(edited(11));
    // The tab is closed or the laptop sleeps: the latest text goes to the
    // browser at once, not a second later.
    first.lifecycle.hide();
    first.session.destroy();
    expect(drafts().map((draft) => draft.digest)).toEqual([
      contentDigest(edited(4)),
    ]);

    // Back online, in a new tab of the same browser: what the dead tab wrote
    // reaches the server and is offered, nothing more.
    network.online = true;
    const second = await openTab(laptop, 'tab-second');
    const offer = second.session.offer.value;
    expect(offer).toMatchObject({
      kind: 'server',
      meta: { writer: 'tab-first' },
    });
    const { data } = await second.session.loadOfferData(offer!);
    expect(contentDigest(data)).toBe(contentDigest(edited(11)));
    expect(describeDiff(second.text(), data)).toContain('added:p-wind');

    // Taking it up leaves one draft, now the new tab's, and keeps what the
    // text was before the connection dropped.
    await second.session.restore(data);
    await settle();
    expect(drafts()).toMatchObject([
      { writer: 'tab-second', digest: contentDigest(edited(11)) },
    ]);
    expect(revisions().map((revision) => revision.digest)).toContain(
      contentDigest(edited(4)),
    );
    expect(laptop.storage.length).toBe(0);
  });

  it('keeps two tabs writing at once apart, each offered the other as it grows', async () => {
    saveArticle(articleA());
    const laptop = createBrowser();
    const left = await openTab(laptop, 'tab-left');
    const right = await openTab(laptop, 'tab-right');
    expect(right.session.offer.value).toBeUndefined();

    await left.write(edited(8));
    await settle();
    expect(right.session.offer.value).toMatchObject({
      meta: { writer: 'tab-left', digest: contentDigest(edited(8)) },
    });

    // The left tab goes on; the right one follows without being touched.
    await left.write(articleB());
    await settle();
    const offer = right.session.offer.value!;
    expect(offer).toMatchObject({
      meta: { digest: contentDigest(articleB()) },
    });
    const { data } = await right.session.loadOfferData(offer);
    expect(describeDiff(right.text(), data)).toEqual(
      describeDiff(articleA(), articleB()),
    );

    // The right tab writes its own change: two drafts, neither overwritten.
    const own = normalizeContentData(articleA());
    own.blocks = retext('p-descent', 'надолго', 'на неделю')(own.blocks);
    await right.write(own);
    await settle();
    expect(
      drafts()
        .map((draft) => draft.writer)
        .sort(),
    ).toEqual(['tab-left', 'tab-right']);
    expect(left.session.offer.value).toMatchObject({
      meta: { writer: 'tab-right', digest: contentDigest(own) },
    });

    // A phone knows nothing of either until it asks the server.
    const phone = createBrowser();
    const mobile = await openTab(phone, 'tab-phone');
    expect(mobile.session.offer.value).toMatchObject({
      meta: { writer: 'tab-right' },
    });

    // The left tab saves. Its draft goes; the right tab, still writing, keeps
    // its own, and closing it without saving keeps its text as a version.
    saveArticle(left.text());
    expect(drafts().map((draft) => draft.writer)).toEqual(['tab-right']);
    await right.session.close({ discarded: true, replacement: null });
    await settle();
    expect(drafts()).toEqual([]);
    expect(
      revisions()
        .map((revision) => revision.reason)
        .sort(),
    ).toEqual(['discarded', 'replaced']);
    expect(
      revisions().find((revision) => revision.reason === 'replaced')!.digest,
    ).toBe(contentDigest(articleA()));
  });

  it('lets a change regretted the next day be found and set right by hand', async () => {
    saveArticle(articleA());
    const laptop = createBrowser();
    const today = await openTab(laptop, 'tab-today');
    await today.write(articleB());
    await settle();
    saveArticle(today.text());
    today.session.destroy();

    // The replaced gallery picture is used by nothing now, yet kept while the
    // version that shows it lives.
    const cleanupCutoff = () => Date.now() - 24 * HOUR;
    await vi.advanceTimersByTimeAsync(30 * HOUR);
    expect(
      (await findOrphanedAssets(cleanupCutoff())).map((row) => row.assetUuid),
    ).toEqual([]);

    // The next day: the paragraph deleted yesterday and the old picture are
    // missed. The saved version before yesterday's save shows them.
    const tomorrow = await openTab(laptop, 'tab-tomorrow');
    const replaced = (await tomorrow.session.loadHistory()).revisions.find(
      (revision) => revision.reason === 'replaced',
    )!;
    const { data: old } = await tomorrow.session.fetchEntry(replaced.id);
    expect(describeDiff(tomorrow.text(), old)).toContain('added:p-accl');

    // Restoring it whole would undo a day's work: it is looked at and put back.
    await tomorrow.session.restore(old);
    await tomorrow.session.undoRestore();
    await settle();
    expect(contentDigest(tomorrow.text())).toBe(contentDigest(articleB()));

    // Set right by hand: the paragraph typed in again, with a word more, as
    // a new block; the old picture back in the gallery.
    const accl = old.blocks.find((block) => block.id === 'p-accl')!;
    let fixed = insert(
      'p-intro',
      p(
        'p-accl-again',
        `${String(accl.data.text).replace('в посёлок', 'в посёлок Терскол')}`,
      ),
      'after',
    )(normalizeContentData(tomorrow.text()).blocks);
    fixed = change('g-days', (block) => ({
      ...block,
      data: {
        items: [
          { id: 'i-dawn', asset: media('a-g1'), caption: 'Рассвет' },
          { id: 'i-camp', asset: media('a-g2'), caption: 'Лагерь под скалами' },
        ],
      },
    }))(fixed);
    await tomorrow.write({ blocks: fixed });
    await settle();
    // Typed anew, the paragraph is still known by its words.
    expect(describeDiff({ blocks: fixed }, old)).toContain(
      'rewritten:p-accl-again',
    );
    saveArticle({ blocks: fixed });

    // Two days after yesterday's save its version goes; today's stays. The
    // picture swapped out today is kept by today's version, then has its day.
    runContentHistoryMaintenance(
      START + CONTENT_HISTORY_REVISION_TTL_MS + HOUR,
    );
    expect(revisions().map((revision) => revision.digest)).toEqual([
      contentDigest(articleB()),
    ]);
    expect(
      (await findOrphanedAssets(cleanupCutoff())).map((row) => row.assetUuid),
    ).toEqual([]);
    const later = Date.now() + CONTENT_HISTORY_REVISION_TTL_MS + HOUR;
    vi.setSystemTime(later);
    runContentHistoryMaintenance(later);
    expect(revisions()).toEqual([]);
    expect(
      (await findOrphanedAssets(cleanupCutoff())).map((row) => row.assetUuid),
    ).toEqual([]);
    vi.setSystemTime(later + 25 * HOUR);
    expect(
      (await findOrphanedAssets(cleanupCutoff())).map((row) => row.assetUuid),
    ).toEqual(['a-g3']);
  });

  it('sends what a closed tab left in the browser once the admin opens again', async () => {
    saveArticle(articleA());
    const laptop = createBrowser();
    const tab = await openTab(laptop, 'tab-closed');
    network.online = false;
    await tab.write(edited(6));
    tab.lifecycle.hide();
    tab.session.destroy();
    network.online = true;
    // The admin bar sends it on the next page, before any editor opens.
    expect(
      await flushContentHistoryBuffers(
        transportFor(laptop),
        createLocalContentHistoryBuffer('/', () => laptop.storage),
        undefined,
        laptop.locks,
      ),
    ).toBe(0);
    expect(drafts()).toMatchObject([
      { writer: 'tab-closed', digest: contentDigest(edited(6)) },
    ]);
  });

  it('leaves what an open tab has not sent yet to that tab', async () => {
    saveArticle(articleA());
    const laptop = createBrowser();
    const writing = await openTab(laptop, 'tab-writing');
    network.online = false;
    await writing.write(edited(6));
    writing.lifecycle.hide();
    network.online = true;
    // Another page of the admin opens, or the connection comes back in every
    // tab at once: its admin bar sends what earlier sessions left. The text
    // of the tab still open is not one of them — sent from here, it could
    // land after a newer one the open tab already had confirmed.
    const buffer = createLocalContentHistoryBuffer('/', () => laptop.storage);
    expect(
      await flushContentHistoryBuffers(
        transportFor(laptop),
        buffer,
        undefined,
        laptop.locks,
      ),
    ).toBe(1);
    expect(drafts()).toEqual([]);
    expect(buffer.list()).toHaveLength(1);
    // Nor is it offered as text left behind to an editor opened meanwhile.
    const reader = await openTab(laptop, 'tab-reading');
    expect(reader.session.offer.value).toBeUndefined();

    // The open tab sends its text itself, and only then is it offered.
    await writing.write(edited(7));
    await settle();
    expect(drafts()).toMatchObject([
      { writer: 'tab-writing', digest: contentDigest(edited(7)) },
    ]);
    expect(buffer.list()).toEqual([]);
  });
});
