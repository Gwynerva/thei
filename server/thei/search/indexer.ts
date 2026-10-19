import { createHash } from 'node:crypto';
import { searchAnalyzer } from './analyzer';
import {
  diaryDocument,
  eventDocument,
  fileDocuments,
  pageDocument,
  profileDocument,
  projectDocument,
  SEARCH_AUDIENCES,
  sectionDocument,
  tagDocuments,
  unplacedDescribedFiles,
  type SearchAudience,
  type SearchDocument,
} from './documents';
import { SearchStore } from './store';

/**
 * Keeps the search index true to the site.
 *
 * A content write marks it stale; after a pause in the writing, a pass in the
 * background finds what changed — by the times the rows were last saved, and
 * by what a tag, a file's description or a status names — builds those
 * entities' documents again and rewrites only the ones that show something
 * new. A change of who may see what can move words of one entity into or out
 * of another's (a note about a now-private entity), so it makes the pass go
 * over everything. So do the first build after boot and one pass a day, as a
 * net under all the rest.
 *
 * Every pass works in slices of a few milliseconds and lets the server answer
 * requests between them. Nothing in it may stop the server: a failure is
 * logged and the next pass tries again.
 */

const QUIET_MS = 2000;
const LONGEST_WAIT_MS = 10_000;
const SLICE_MS = 15;
const FIRST_PASS_DELAY_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

type EntityKind =
  'project' | 'project-section' | 'event' | 'diary-entry' | 'page';
const BUILDERS: Record<
  EntityKind,
  (id: string, audience: SearchAudience) => Promise<SearchDocument | undefined>
> = {
  project: projectDocument,
  'project-section': sectionDocument,
  event: eventDocument,
  'diary-entry': diaryDocument,
  page: pageDocument,
};

interface IndexState {
  store?: SearchStore;
  path?: string;
  /** Watermark: rows saved after this are what a pass looks at. */
  passedAt: number;
  /** Whether the index has ever been built whole. */
  complete: boolean;
  progress?: { done: number; total: number };
  running?: Promise<void>;
  again: 'none' | 'changes' | 'all';
  timer?: ReturnType<typeof setTimeout>;
  staleSince?: number;
  /** What decides who may see what, as last read. */
  visibility?: string;
  /** The statuses of each owner, as last read. */
  statuses?: Map<string, string>;
}

const state: IndexState = { passedAt: 0, complete: false, again: 'none' };

export function searchIndexPath() {
  return THEI_SERVER.projectPath('.thei', 'search.db');
}

/** The index, opened on first use; another reading of words empties it. */
export function useSearchStore(
  path = state.path ?? searchIndexPath(),
): SearchStore {
  const reading = searchAnalyzer();
  if (
    state.store &&
    state.path === path &&
    state.store.getMeta('format')?.endsWith(`/${reading.id}`)
  )
    return state.store;
  state.store?.close();
  state.store = new SearchStore(path, reading);
  state.path = path;
  state.complete = state.store.getMeta('complete') === '1';
  return state.store;
}

/** Closes the index; the next use opens it again. For tests and shutdown. */
export function closeSearchStore() {
  if (state.timer) clearTimeout(state.timer);
  state.store?.close();
  Object.assign(state, {
    store: undefined,
    path: undefined,
    passedAt: 0,
    complete: false,
    progress: undefined,
    running: undefined,
    again: 'none',
    timer: undefined,
    staleSince: undefined,
    visibility: undefined,
    statuses: undefined,
  } satisfies IndexState);
}

/** How far the first build is, while there is no whole index yet. */
export function searchIndexProgress():
  { done: number; total: number } | undefined {
  return state.complete ? undefined : (state.progress ?? { done: 0, total: 0 });
}

let sliceStart = 0;
/** Gives the server its turn once a slice of work has run long enough. */
async function yieldTurn() {
  if (performance.now() - sliceStart < SLICE_MS) return;
  await new Promise((resolve) => setImmediate(resolve));
  sliceStart = performance.now();
}

function entityIds(): Record<EntityKind, string[]> {
  const { rawDb } = THEI_SERVER.useDb();
  const ids = (sql: string) =>
    (rawDb.prepare(sql).all() as { id: string }[]).map((row) => row.id);
  return {
    project: ids('SELECT projectUuid AS id FROM projects'),
    'project-section': ids(
      'SELECT sectionUuid AS id FROM "project-content-sections"',
    ),
    event: ids('SELECT eventUuid AS id FROM events'),
    'diary-entry': ids('SELECT diaryUuid AS id FROM "diary-entries"'),
    page: ids('SELECT pageUuid AS id FROM pages'),
  };
}

/**
 * Who may see what, as one fingerprint: the access of every entity, the
 * privacy of sections and of placed files. When it moves, words can have
 * moved between entities — a note about an entity that has just turned
 * private — and a pass goes over everything.
 */
function readVisibility(): string {
  const { rawDb } = THEI_SERVER.useDb();
  const rows = rawDb
    .prepare(
      `SELECT 'p' || projectUuid || access FROM projects
       UNION ALL SELECT 'e' || eventUuid || access FROM events
       UNION ALL SELECT 'd' || diaryUuid || access FROM "diary-entries"
       UNION ALL SELECT 'g' || pageUuid || access FROM pages
       UNION ALL SELECT 's' || sectionUuid || isPrivate FROM "project-content-sections"
       UNION ALL SELECT 'u' || assetUuid || containerType || containerId || role || meta FROM "asset-usages" WHERE meta LIKE '%"isPrivate":true%'`,
    )
    .pluck()
    .all() as string[];
  rows.sort();
  return createHash('sha1').update(rows.join('\n')).digest('base64url');
}

/**
 * The statuses of each owner, as one fingerprint each: a status has no time
 * of its last save, so a pass compares these to learn whose changed.
 */
function readStatuses(): Map<string, string> {
  const { rawDb } = THEI_SERVER.useDb();
  const rows = rawDb
    .prepare(
      `SELECT ownerType || ':' || ownerId AS owner, group_concat(id || char(31) || text || char(31) || date, char(30)) AS words
       FROM (SELECT * FROM statuses ORDER BY id) GROUP BY ownerType, ownerId`,
    )
    .all() as { owner: string; words: string }[];
  return new Map(rows.map((row) => [row.owner, row.words]));
}

/** The entities saved since a moment, and whatever a change elsewhere names. */
function changedSince(
  since: number,
): Map<EntityKind | 'profile' | 'tags', Set<string>> {
  const { rawDb } = THEI_SERVER.useDb();
  const changed = new Map<EntityKind | 'profile' | 'tags', Set<string>>();
  const add = (kind: EntityKind | 'profile' | 'tags', id: string) =>
    changed.set(kind, (changed.get(kind) ?? new Set()).add(id));
  const rows = (sql: string) =>
    rawDb.prepare(sql).all(since) as { id: string; kind?: string }[];
  for (const row of rows(
    'SELECT projectUuid AS id FROM projects WHERE updatedAt > ?',
  ))
    add('project', row.id);
  for (const row of rows(
    'SELECT projectUuid AS id, sectionUuid AS kind FROM "project-content-sections" WHERE updatedAt > ?',
  )) {
    add('project', row.id);
    add('project-section', row.kind!);
  }
  for (const row of rows(
    'SELECT eventUuid AS id FROM events WHERE updatedAt > ?',
  ))
    add('event', row.id);
  for (const row of rows(
    'SELECT diaryUuid AS id FROM "diary-entries" WHERE updatedAt > ?',
  ))
    add('diary-entry', row.id);
  for (const row of rows(
    'SELECT pageUuid AS id FROM pages WHERE updatedAt > ?',
  ))
    add('page', row.id);
  if (rows('SELECT profileId AS id FROM profiles WHERE updatedAt > ?').length)
    add('profile', 'profile');
  for (const row of rows(
    'SELECT ownerType AS kind, ownerId AS id FROM content WHERE updatedAt > ?',
  )) {
    if (row.kind === 'profile') add('profile', 'profile');
    else if (row.kind && row.kind in BUILDERS)
      add(row.kind as EntityKind, row.id);
  }
  // A tag renamed: every entity that carries it, and the tags themselves.
  for (const row of rows(
    'SELECT u.containerType AS kind, u.containerId AS id FROM tags t JOIN "tag-usages" u ON u.tagUuid = t.tagUuid WHERE t.updatedAt > ?',
  ))
    if (row.kind && row.kind in BUILDERS) add(row.kind as EntityKind, row.id);
  if (rows('SELECT tagUuid AS id FROM tags WHERE updatedAt > ?').length)
    add('tags', 'tags');
  // A file described anew: every place it is shown at.
  for (const row of rows(
    `SELECT u.containerType AS kind, u.containerId AS id FROM "asset-descriptions" d
       JOIN assets a ON a.familyUuid = d.familyUuid
       JOIN "asset-usages" u ON u.assetUuid = a.assetUuid
     WHERE d.updatedAt > ?`,
  )) {
    if (row.kind === 'content') {
      const owner = rawDb
        .prepare(
          'SELECT ownerType AS kind, ownerId AS id FROM content WHERE contentUuid = ?',
        )
        .get(row.id) as { kind: string; id: string } | undefined;
      if (owner && owner.kind in BUILDERS)
        add(owner.kind as EntityKind, owner.id);
    } else if (row.kind && row.kind in BUILDERS)
      add(row.kind as EntityKind, row.id);
  }
  // A project changed: its sections name it, carry its tags and its access.
  for (const projectUuid of changed.get('project') ?? [])
    for (const row of rawDb
      .prepare(
        'SELECT sectionUuid AS id FROM "project-content-sections" WHERE projectUuid = ?',
      )
      .all(projectUuid) as { id: string }[])
      add('project-section', row.id);
  return changed;
}

/** Rewrites the documents of one entity for both readers. */
async function reindexEntity(
  store: SearchStore,
  kind: EntityKind,
  id: string,
  touchedFamilies: Map<SearchAudience, Set<string>>,
): Promise<boolean> {
  let changed = false;
  for (const audience of SEARCH_AUDIENCES) {
    const ref = `${kind}:${id}`;
    const families = touchedFamilies.get(audience)!;
    for (const family of store.familiesOf(audience, ref)) families.add(family);
    const document = await BUILDERS[kind](id, audience);
    if (document) {
      changed = store.write(document) || changed;
      for (const family of store.familiesOf(audience, ref))
        families.add(family);
    } else changed = store.remove(audience, ref) || changed;
    await yieldTurn();
  }
  return changed;
}

async function rewriteSmallKinds(store: SearchStore): Promise<boolean> {
  let changed = false;
  for (const audience of SEARCH_AUDIENCES) {
    const tags = await tagDocuments(audience);
    const shown = new Set(tags.map((tag) => tag.ref));
    for (const tag of tags) changed = store.write(tag) || changed;
    for (const ref of store.refs(audience, 'tag'))
      if (!shown.has(ref)) changed = store.remove(audience, ref) || changed;
    const profile = await profileDocument(audience);
    if (profile) changed = store.write(profile) || changed;
    else changed = store.remove(audience, 'profile') || changed;
    await yieldTurn();
  }
  return changed;
}

function rewriteFiles(
  store: SearchStore,
  audience: SearchAudience,
  families?: Set<string>,
): boolean {
  let changed = false;
  const places = store.filePlaces(audience, families);
  const unplaced =
    audience === 'owner'
      ? unplacedDescribedFiles(new Set(store.filePlaces('owner').keys()))
      : new Map<string, { assetUuid: string; description: string }>();
  const wanted = families
    ? new Map([...unplaced].filter(([family]) => families.has(family)))
    : unplaced;
  const documents = fileDocuments(audience, places, wanted);
  for (const family of families ?? [])
    if (!documents.has(family)) documents.set(family, undefined);
  for (const [family, document] of documents)
    changed =
      (document
        ? store.write(document)
        : store.remove(audience, `file:${family}`)) || changed;
  if (!families) {
    for (const ref of store.refs(audience, 'file'))
      if (!documents.get(ref.slice('file:'.length)))
        changed = store.remove(audience, ref) || changed;
  }
  return changed;
}

/** Builds every document again and keeps only what changed. */
async function passEverything(store: SearchStore) {
  const started = Date.now();
  sliceStart = performance.now();
  const ids = entityIds();
  const total = Object.values(ids).reduce((sum, list) => sum + list.length, 0);
  state.progress = { done: 0, total };
  let changed = false;
  const families = new Map(
    SEARCH_AUDIENCES.map((audience) => [audience, new Set<string>()]),
  );
  for (const kind of Object.keys(BUILDERS) as EntityKind[]) {
    const present = new Set(ids[kind].map((id) => `${kind}:${id}`));
    for (const id of ids[kind]) {
      changed = (await reindexEntity(store, kind, id, families)) || changed;
      state.progress.done += 1;
    }
    for (const audience of SEARCH_AUDIENCES)
      for (const ref of store.refs(audience, kind))
        if (!present.has(ref)) changed = store.remove(audience, ref) || changed;
  }
  changed = (await rewriteSmallKinds(store)) || changed;
  for (const audience of SEARCH_AUDIENCES)
    changed = rewriteFiles(store, audience) || changed;
  if (changed) store.bumpGeneration();
  state.passedAt = started;
  state.visibility = readVisibility();
  state.statuses = readStatuses();
  state.complete = true;
  store.setMeta('complete', '1');
  state.progress = undefined;
}

/** Builds what changed since the last pass. */
async function passChanges(store: SearchStore) {
  const visibility = readVisibility();
  if (visibility !== state.visibility || !state.complete)
    return passEverything(store);
  const started = Date.now();
  sliceStart = performance.now();
  // A second of overlap: a save that landed while the last pass read.
  const changed = changedSince(state.passedAt - 1000);
  const statuses = readStatuses();
  for (const owner of new Set([
    ...statuses.keys(),
    ...(state.statuses?.keys() ?? []),
  ])) {
    if (statuses.get(owner) === state.statuses?.get(owner)) continue;
    const [kind, id] = owner.split(':') as [string, string];
    if (kind === 'project')
      changed.set('project', (changed.get('project') ?? new Set()).add(id));
  }
  let any = false;
  const families = new Map(
    SEARCH_AUDIENCES.map((audience) => [audience, new Set<string>()]),
  );
  for (const kind of Object.keys(BUILDERS) as EntityKind[])
    for (const id of changed.get(kind) ?? [])
      any = (await reindexEntity(store, kind, id, families)) || any;
  // Something gone: its documents go too.
  const ids = entityIds();
  for (const kind of Object.keys(BUILDERS) as EntityKind[]) {
    const present = new Set(ids[kind].map((id) => `${kind}:${id}`));
    for (const audience of SEARCH_AUDIENCES)
      for (const ref of store.refs(audience, kind)) {
        if (present.has(ref)) continue;
        for (const family of store.familiesOf(audience, ref))
          families.get(audience)!.add(family);
        any = store.remove(audience, ref) || any;
      }
  }
  any = (await rewriteSmallKinds(store)) || any;
  for (const audience of SEARCH_AUDIENCES) {
    const touched = families.get(audience)!;
    // A description saved anew reaches the file's own document too.
    const { rawDb } = THEI_SERVER.useDb();
    for (const row of rawDb
      .prepare(
        'SELECT familyUuid AS family FROM "asset-descriptions" WHERE updatedAt > ?',
      )
      .all(state.passedAt - 1000) as { family: string }[])
      touched.add(row.family);
    if (touched.size) any = rewriteFiles(store, audience, touched) || any;
  }
  if (any) store.bumpGeneration();
  state.passedAt = started;
  state.visibility = visibility;
  state.statuses = statuses;
}

function run(kind: 'changes' | 'all'): Promise<void> {
  if (state.running) {
    if (state.again !== 'all') state.again = kind;
    return state.running;
  }
  state.running = (async () => {
    let next: 'none' | 'changes' | 'all' = kind;
    while (next !== 'none') {
      state.again = 'none';
      try {
        const store = useSearchStore();
        if (next === 'all') await passEverything(store);
        else await passChanges(store);
      } catch (error) {
        THEI_SERVER.console
          .tag('Search')
          .error('The search index pass failed', error);
        state.progress = undefined;
      }
      next = state.again;
    }
  })().finally(() => {
    state.running = undefined;
  });
  return state.running;
}

/**
 * Called after every content write: a pass follows once the writing pauses,
 * and within ten seconds at most while it goes on.
 */
export function markSearchStale() {
  if (!state.store) return;
  const now = Date.now();
  state.staleSince ??= now;
  if (state.timer) clearTimeout(state.timer);
  const wait = Math.max(
    0,
    Math.min(QUIET_MS, state.staleSince + LONGEST_WAIT_MS - now),
  );
  state.timer = setTimeout(() => {
    state.timer = undefined;
    state.staleSince = undefined;
    void run('changes');
  }, wait);
  state.timer.unref?.();
}

/** Builds the index whole, now; for tests and the first build. */
export function rebuildSearchIndex(): Promise<void> {
  return run('all');
}

/** Brings the index up to date with what changed, now. */
export function refreshSearchIndex(): Promise<void> {
  return run('changes');
}

/**
 * After boot: the first pass goes over everything — a new site builds its
 * index, an old one checks it against the content it serves — and so does
 * one pass a day.
 */
export function bootSearch() {
  setTimeout(() => {
    try {
      useSearchStore();
    } catch (error) {
      THEI_SERVER.console
        .tag('Search')
        .error('The search index could not be opened', error);
      return;
    }
    void run('all');
  }, FIRST_PASS_DELAY_MS).unref();
  setInterval(() => void run('all'), DAY_MS).unref();
}

/**
 * The index as up to date as it can be now: built whole if it never was,
 * with a pass that waits for a pause in the writing run at once. For a
 * reader that may wait — MCP, the site's model — not for the search page.
 */
export async function freshSearchIndex(): Promise<void> {
  useSearchStore();
  if (!state.complete) return rebuildSearchIndex();
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
    state.staleSince = undefined;
    return run('changes');
  }
  if (state.running) return state.running;
}
