import { utcDayOf } from '#layers/thei/shared/date-range';
import { dayQueryRank, parseDayQuery } from '#layers/thei/shared/day-query';
import { resolvePagination } from '#layers/thei/shared/pagination';
import {
  SEARCH_KINDS,
  SEARCH_PAGE_SIZE,
  type SearchFacets,
  type SearchFind,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
  type SearchResponse,
} from '#layers/thei/shared/search/api';
import { snippetSegments } from '#layers/thei/shared/search/snippet';
import {
  answersQueryWord,
  parseSearchQuery,
  requiredQueryWords,
  searchTokens,
  type SearchQuery,
} from '#layers/thei/shared/search/tokens';
import { normalizeTermText } from '#layers/thei/shared/text-terms';
import { buildPublicTags } from '../public/entities';
import { runCatalogue } from './catalogue';
import { placeHref, type SearchAudience } from './documents';
import { searchAnalyzer, searchIndexProgress, useSearchStore } from './indexer';
import { ftsTerm, type SearchStore, type StoredCard } from './store';
import { SEARCH_FIELD_WEIGHTS, SEARCH_FIELDS, type SearchUnit } from './units';

/** How many of each kind the search answers at once when no kind is chosen. */
export const SEARCH_GROUP_SIZE = 3;
/** How many of a kind are weighed to choose those few. */
const SEARCH_GROUP_CANDIDATES = 12;
export { SEARCH_PAGE_SIZE };
/** Finds told of each entity on the search page. */
const PAGE_FINDS = 3;

export interface SearchRequest {
  q: string;
  audience: SearchAudience;
  /** One kind: a page of it. None: a few of every kind. */
  kind?: SearchKind;
  /** Tag slugs every hit carries, and ones none carries. */
  tags?: string[];
  exclude?: string[];
  showcase?: boolean;
  cv?: boolean;
  year?: number;
  /** Only what falls on these days or between them. */
  from?: string;
  to?: string;
  page?: number;
  /** A page of one kind by its own measure, in place of `page`: for MCP. */
  offset?: number;
  limit?: number;
  /** How many of each kind when no kind is chosen. */
  groupSize?: number;
  /** The quick search: a few of each kind, one find each. */
  quick?: boolean;
  /** The query is being typed: its last word is unfinished. */
  typing?: boolean;
  now?: number;
}

interface DocRow {
  id: number;
  kind: SearchKind;
  ref: string;
  title: string;
  date: string | null;
  card: string;
}

const WEIGHTS = SEARCH_FIELDS.map((field) => SEARCH_FIELD_WEIGHTS[field]).join(', ');
const RELATIVE_DAYS: Record<string, number> = {
  сегодня: 0,
  вчера: -1,
  позавчера: -2,
  today: 0,
  yesterday: -1,
};

/** The FTS5 query of the words a search insists on, and its phrases. */
function ftsMatch(query: SearchQuery): string | undefined {
  const parts = requiredQueryWords(query).map((word) => {
    const options = word.terms.map((term) => `"${ftsTerm(term)}"`);
    if (word.prefix) options.push(`"${ftsTerm(word.word)}"*`);
    return options.length > 1 ? `(${options.join(' OR ')})` : options[0]!;
  });
  for (const phrase of query.phrases)
    parts.push(`"${phrase.map(ftsTerm).join(' ')}"`);
  return parts.length ? parts.join(' AND ') : undefined;
}

interface Filters {
  sql: string;
  params: unknown[];
}

function tagUuidsBySlug(slugs: string[] | undefined): string[] {
  if (!slugs?.length) return [];
  const { rawDb } = THEI_SERVER.useDb();
  return slugs.flatMap((slug) => {
    const row = rawDb.prepare('SELECT tagUuid FROM tags WHERE slug = ?').get(slug) as { tagUuid: string } | undefined;
    return row ? [row.tagUuid] : [];
  });
}

/** The conditions every hit meets, but the kind and the year, which facets count across. */
function baseFilters(request: SearchRequest, store: SearchStore): Filters {
  const sql: string[] = ['d.visibleFrom <= ?'];
  const params: unknown[] = [request.now ?? Date.now()];
  for (const tag of tagUuidsBySlug(request.tags)) {
    sql.push('EXISTS (SELECT 1 FROM doc_tags t WHERE t.doc = d.id AND t.tag = ?)');
    params.push(tag);
  }
  for (const tag of tagUuidsBySlug(request.exclude)) {
    sql.push('NOT EXISTS (SELECT 1 FROM doc_tags t WHERE t.doc = d.id AND t.tag = ?)');
    params.push(tag);
  }
  if (request.showcase) sql.push("(d.kind <> 'project' OR d.showcase = 1)");
  if (request.cv) sql.push("(d.kind <> 'project' OR d.cv = 1)");
  if (request.showcase || request.cv) sql.push("d.kind = 'project'");
  if (request.from) {
    sql.push('d.date >= ?');
    params.push(request.from);
  }
  if (request.to) {
    sql.push('d.date <= ?');
    params.push(request.to);
  }
  return { sql: sql.join(' AND '), params };
}

function narrowed(base: Filters, request: SearchRequest, kind = request.kind): Filters {
  const sql = [base.sql];
  const params = [...base.params];
  if (kind) {
    sql.push('d.kind = ?');
    params.push(kind);
  }
  if (request.year) {
    sql.push('d.year = ?');
    params.push(request.year);
  }
  return { sql: sql.join(' AND '), params };
}

/** The day a query names, when it names one or a stretch of them. */
function dayMatcher(q: string, now: number): ((date: string) => number | undefined) | undefined {
  const word = normalizeTermText(q.trim());
  if (word in RELATIVE_DAYS) {
    const day = utcDayOf(now + RELATIVE_DAYS[word]! * 24 * 60 * 60 * 1000);
    return (date) => (date === day ? 0 : undefined);
  }
  const parsed = parseDayQuery(q);
  return parsed ? (date) => dayQueryRank(date, parsed) : undefined;
}

/** Whether a unit holds a phrase: its terms in a row. */
function phraseSpans(tokens: ReturnType<typeof searchTokens>, phrase: string[]) {
  const spans: { start: number; end: number }[] = [];
  for (let at = 0; at + phrase.length <= tokens.length; at++)
    if (phrase.every((term, offset) => tokens[at + offset]!.term === term))
      spans.push({ start: tokens[at]!.start, end: tokens[at + phrase.length - 1]!.end });
  return spans;
}

function textFragment(href: string, words: string[]): string {
  if (!words.length) return href;
  const directive = `:~:text=${encodeURIComponent(words.join(' ')).replaceAll('-', '%2D')}`;
  return href.includes('#') ? `${href}${directive}` : `${href}#${directive}`;
}

/**
 * Where in an entity the query's words stand, best first: units holding more
 * of the words, then units in weightier fields. Another name of the entity
 * is said to have matched and never shown.
 */
export function findsOf(
  units: SearchUnit[],
  query: SearchQuery,
  document: { href: string },
  limit: number,
  withPlace = false,
): { finds: SearchFind[]; more: number; closeness: number } {
  const analyzer = searchAnalyzer();
  // How close the text comes to what was typed: words as typed, not only
  // their stems, and the words standing together in the order typed.
  const asTyped = new Set<number>();
  let together = false;
  const words = query.words;
  const probes = words.map((word) => word.word.slice(0, Math.max(2, Math.min(word.word.length, 3))));
  const found: { unit: SearchUnit; order: number; score: number; spans: { start: number; end: number }[]; words: string[] }[] = [];
  units.forEach((unit, order) => {
    const lower = normalizeTermText(unit.text);
    if (!probes.some((probe) => lower.includes(probe)) && !query.phrases.length) return;
    const tokens = searchTokens(unit.text, analyzer, 'index');
    const spans: { start: number; end: number }[] = [];
    const answered = new Set<number>();
    const marked: string[] = [];
    let previous = -1;
    for (const token of tokens) {
      let answeredHere = -1;
      words.forEach((word, at) => {
        if (!answersQueryWord(token, word)) return;
        answered.add(at);
        answeredHere = at;
        if (token.word === word.word) asTyped.add(at);
        spans.push({ start: token.start, end: token.end });
        const written = unit.text.slice(token.start, token.end);
        if (!word.stop && marked.length < 3 && !marked.includes(written)) marked.push(written);
      });
      if (answeredHere > 0 && answeredHere === previous + 1) together = true;
      previous = answeredHere;
    }
    for (const phrase of query.phrases) {
      const at = phraseSpans(tokens, phrase);
      if (at.length) answered.add(words.length + query.phrases.indexOf(phrase));
      spans.push(...at);
      if (at[0] && !marked.length) marked.push(unit.text.slice(at[0].start, at[0].end));
    }
    const meaningful = [...answered].filter((at) => at >= words.length || !words[at]!.stop).length;
    if (!meaningful) return;
    found.push({
      unit,
      order,
      score: meaningful * 100 + SEARCH_FIELD_WEIGHTS[unit.field] * 10,
      spans: spans.sort((a, b) => a.start - b.start),
      words: marked,
    });
  });
  found.sort((a, b) => b.score - a.score || a.order - b.order);
  // One find for words said twice in the same kind of place; the rest are
  // counted only once each too.
  const seen = new Set<string>();
  const distinct = found.filter(({ unit }) => {
    const key = unit.hidden
      ? `${unit.where}:${unit.place?.relation?.title ?? ''}`
      : `${unit.where}:${unit.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const shown: SearchFind[] = [];
  for (const item of distinct.slice(0, limit)) {
    const { unit } = item;
    const at = placeHref(document, unit.place ?? {});
    const plain = unit.where === 'title' || unit.where === 'summary' || unit.where === 'name';
    shown.push({
      where: unit.where,
      ...(unit.place?.section && unit.where !== 'heading'
        ? { label: unit.place.section.title }
        : unit.place?.relation
          ? { label: unit.place.relation.title }
          : unit.place?.status
            ? { label: unit.place.status.date }
            : unit.place?.file?.title
              ? { label: unit.place.file.title }
              : {}),
      href: plain || unit.hidden ? document.href : textFragment(at, item.words),
      segments: unit.hidden ? [] : snippetSegments(unit.text, item.spans),
      ...(unit.media && (unit.where === 'file' || unit.where === 'caption') ? { media: unit.media } : {}),
      ...(withPlace && unit.place && (unit.place.section || unit.place.block || unit.place.file)
        ? {
            place: {
              ...(unit.place.section ? { section: unit.place.section.id } : {}),
              ...(unit.place.block ? { block: unit.place.block } : {}),
              ...(unit.place.file ? { file: unit.place.file.assetUuid } : {}),
            },
          }
        : {}),
    });
  }
  return {
    finds: shown,
    more: distinct.length - shown.length,
    closeness: asTyped.size * 2 + (together ? 3 : 0),
  };
}

function hitOf(row: DocRow, finds: SearchFind[], more: number): SearchHit {
  const card = JSON.parse(row.card) as StoredCard;
  return {
    kind: row.kind,
    // A file is named by the asset its places show: a stranger's slug, never
    // the family's storage id.
    ref: row.kind === 'file' && card.file ? `file:${card.file.assetUuid}` : row.ref,
    title: row.title,
    href: card.href,
    ...(card.editHref ? { editHref: card.editHref } : {}),
    ...(row.date ? { date: row.date } : {}),
    ...(card.period ? { period: card.period } : {}),
    ...(card.summary ? { summary: card.summary } : {}),
    ...(card.media ? { media: card.media } : {}),
    ...(card.file ? { file: card.file } : {}),
    ...(card.showcase ? { showcase: true } : {}),
    ...(card.cv ? { cv: true } : {}),
    ...(card.access ? { access: card.access } : {}),
    finds,
    more,
  };
}

async function tagFacets(
  rows: { tag: string; n: number }[],
  request: SearchRequest,
  store: SearchStore,
): Promise<SearchFacets['tags']> {
  const included = new Set(tagUuidsBySlug(request.tags));
  const excluded = new Set(tagUuidsBySlug(request.exclude));
  const counts = new Map(rows.map((row) => [row.tag, row.n]));
  for (const tag of [...included, ...excluded]) if (!counts.has(tag)) counts.set(tag, 0);
  if (!counts.size) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const tags = db.select().from(schema.tags).all().filter((tag) => counts.has(tag.tagUuid));
  const summaries = await buildPublicTags(
    tags.map((tag) => ({
      tagUuid: tag.tagUuid,
      title: tag.title,
      slug: tag.slug,
      publicId: tag.publicId,
      description: tag.description || undefined,
    })),
  );
  return tags
    .map((tag, at) => ({
      tag: summaries[at]!,
      count: counts.get(tag.tagUuid) ?? 0,
      ...(included.has(tag.tagUuid)
        ? { state: 'include' as const }
        : excluded.has(tag.tagUuid)
          ? { state: 'exclude' as const }
          : {}),
    }))
    .sort((left, right) => right.count - left.count || left.tag.title.localeCompare(right.tag.title));
}

/**
 * Each facet counts across its own choice and within the other: the kinds in
 * the year chosen, the years in the kind chosen — so a chip and a bar say how
 * many choosing it shows.
 */
function countFacets(
  rows: { kind: SearchKind; year: number | null; n: number }[],
  request: Pick<SearchRequest, 'kind' | 'year'>,
) {
  const kinds: SearchFacets['kinds'] = {};
  const years = new Map<number, number>();
  for (const row of rows) {
    if (!request.year || row.year === request.year)
      kinds[row.kind] = (kinds[row.kind] ?? 0) + row.n;
    if (row.year && (!request.kind || row.kind === request.kind))
      years.set(row.year, (years.get(row.year) ?? 0) + row.n);
  }
  return {
    kinds,
    years: [...years].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
  };
}

/** One search, as the index answers it now. */
async function searchOnce(
  request: SearchRequest,
  store: SearchStore,
  text: string,
): Promise<SearchResponse> {
  const query = parseSearchQuery(text, searchAnalyzer(), { typing: request.typing });
  const match = ftsMatch(query);
  const now = request.now ?? Date.now();
  const days = dayMatcher(text, now);
  if (!match && !days)
    return runCatalogue(
      {
        q: '',
        ...(request.kind === 'project' || request.kind === 'event' ? { type: request.kind } : {}),
        showcase: Boolean(request.showcase),
        cv: Boolean(request.cv),
        tags: request.tags ?? [],
        exclude: request.exclude ?? [],
      },
      request.page ?? 1,
      request.audience === 'owner',
    );
  const table = `fts_${request.audience}`;
  const base = baseFilters(request, store);
  const facetFilter = { sql: base.sql, params: base.params };
  const from = `${table} JOIN docs d ON d.id = ${table}.rowid`;
  const textRows = match
    ? (store.db
        .prepare(`SELECT d.kind, d.year, count(*) AS n FROM ${from} WHERE ${table} MATCH ? AND ${facetFilter.sql} GROUP BY d.kind, d.year`)
        .all(match, ...facetFilter.params) as { kind: SearchKind; year: number | null; n: number }[])
    : [];
  // A query that names a day finds the diary of that day, whatever it says.
  const dayRows = days
    ? (
        store.db
          .prepare(`SELECT d.id, d.kind, d.ref, d.title, d.date, d.card FROM docs d WHERE d.audience = ? AND d.kind = 'diary-entry' AND ${base.sql}`)
          .all(request.audience, ...base.params) as DocRow[]
      )
        .map((row) => ({ row, rank: days(row.date ?? '') }))
        .filter((item): item is { row: DocRow; rank: number } => item.rank !== undefined)
        .sort((a, b) => a.rank - b.rank || (b.row.date ?? '').localeCompare(a.row.date ?? ''))
        .map((item) => item.row)
    : [];
  const dayIds = new Set(dayRows.map((row) => row.id));
  const facets = countFacets(textRows, request);
  if (dayRows.length) {
    const year = request.year ? ' AND d.year = ?' : '';
    const textDiary = match
      ? (store.db
          .prepare(
            `SELECT d.id FROM ${from} WHERE ${table} MATCH ? AND d.kind = 'diary-entry' AND ${facetFilter.sql}${year}`,
          )
          .pluck()
          .all(match, ...facetFilter.params, ...(request.year ? [request.year] : [])) as number[])
      : [];
    const daysInYear = dayRows
      .filter((row) => !request.year || Number(row.date?.slice(0, 4)) === request.year)
      .map((row) => row.id);
    const union = new Set([...textDiary, ...daysInYear]);
    facets.kinds['diary-entry'] = union.size;
  }
  const tagRows = match
    ? (store.db
        .prepare(`SELECT t.tag, count(*) AS n FROM ${from} JOIN doc_tags t ON t.doc = d.id WHERE ${table} MATCH ? AND ${narrowed(base, request).sql} GROUP BY t.tag`)
        .all(match, ...narrowed(base, request).params) as { tag: string; n: number }[])
    : [];

  const findsLimit = request.quick ? 1 : PAGE_FINDS;
  /**
   * The hits of a few rows, those closest to what was typed first: bm25 reads
   * stems only, so a word as typed and words standing together reorder the
   * candidates it brought.
   */
  const hydrate = (rows: DocRow[], keep = rows.length): SearchHit[] =>
    rows
      .map((row, order) => {
        const card = JSON.parse(row.card) as StoredCard;
        const units = store.units(row.id);
        const { finds, more, closeness } = findsOf(
          units,
          query,
          { href: card.href },
          findsLimit,
          request.audience === 'owner',
        );
        const day = dayIds.has(row.id);
        if (day) finds.unshift({ where: 'day', label: row.date ?? '', href: card.href, segments: [] });
        return { hit: hitOf(row, finds.slice(0, findsLimit), more), order, closeness: day ? 100 : closeness };
      })
      .sort((a, b) => b.closeness - a.closeness || a.order - b.order)
      .slice(0, keep)
      .map((item) => item.hit);
  const ranked = (kind: SearchKind, limit: number, offset: number): DocRow[] => {
    const filters = narrowed(base, request, kind);
    // The diary of a day the query names comes first, then the text's hits.
    const mergesDays = kind === 'diary-entry' && dayRows.length > 0;
    const textHits = match
      ? (store.db
          .prepare(
            `SELECT d.id, d.kind, d.ref, d.title, d.date, d.card FROM ${from}
             WHERE ${table} MATCH ? AND ${filters.sql}
             ORDER BY bm25(${table}, ${WEIGHTS}) LIMIT ? OFFSET ?`,
          )
          .all(
            match,
            ...filters.params,
            mergesDays ? offset + limit + dayRows.length : limit,
            mergesDays ? 0 : offset,
          ) as DocRow[])
      : [];
    if (!mergesDays) return textHits;
    const merged = [...dayRows.filter((row) => !request.year || Number(row.date?.slice(0, 4)) === request.year)];
    for (const row of textHits) if (!dayIds.has(row.id)) merged.push(row);
    return merged.slice(offset, offset + limit);
  };

  const kinds = SEARCH_KINDS.filter((kind) => (facets.kinds[kind] ?? 0) > 0);
  let groups: SearchGroup[];
  let page = 1;
  let pageCount = 1;
  if (request.kind) {
    const total = facets.kinds[request.kind] ?? 0;
    const size = request.limit ?? SEARCH_PAGE_SIZE;
    const pagination = resolvePagination(total, request.page, size);
    page = pagination.page;
    pageCount = pagination.pageCount;
    const offset = request.offset ?? (page - 1) * size;
    const rows = total && offset < total ? ranked(request.kind, size, offset) : [];
    groups = rows.length ? [{ kind: request.kind, total, hits: hydrate(rows) }] : [];
  } else {
    groups = kinds.map((kind) => ({
      kind,
      total: facets.kinds[kind] ?? 0,
      hits: hydrate(
        ranked(kind, Math.max(SEARCH_GROUP_CANDIDATES, (request.groupSize ?? 0) * 2), 0),
        request.groupSize ?? SEARCH_GROUP_SIZE,
      ),
    }));
  }
  const total = request.kind
    ? (facets.kinds[request.kind] ?? 0)
    : Object.values(facets.kinds).reduce((sum, n) => sum + (n ?? 0), 0);
  return {
    query: query.text,
    total,
    groups,
    facets: { ...facets, tags: await tagFacets(tagRows, request, store) },
    page,
    pageCount,
  };
}

/**
 * Searches the index for one reader. When nothing is found as typed and the
 * query reads as typed on the other keyboard, that is searched instead and
 * said in `keyboard`.
 */
export async function runSearch(request: SearchRequest): Promise<SearchResponse> {
  const store = useSearchStore();
  const building = searchIndexProgress();
  const response = await searchOnce(request, store, request.q);
  if (!response.total && response.query) {
    const other = searchAnalyzer().otherKeyboard(normalizeTermText(request.q));
    if (other && other !== normalizeTermText(request.q)) {
      const again = await searchOnce(request, store, other);
      if (again.total) return { ...again, keyboard: other, ...(building ? { building } : {}) };
    }
  }
  return building ? { ...response, building } : response;
}


const CACHE_LIMIT = 500;
const cache = new Map<string, SearchResponse>();

/**
 * `runSearch`, remembered: the last answers, each for the index's generation
 * it was made at, so an answer never outlives a change of what it shows.
 */
/** The most places one result shows when asked for all of them. */
const ALL_FINDS = 50;

/**
 * Every place one result holds the words at, for its card asked to show the
 * rest: the same reading as the search's, for the same reader. Undefined for
 * a result this reader may not find.
 */
export function findsOfResult(request: {
  q: string;
  audience: SearchAudience;
  ref: string;
  typing?: boolean;
  now?: number;
}): { finds: SearchFind[]; more: number } | undefined {
  const store = useSearchStore();
  type Row = { id: number; card: string; visibleFrom: number };
  // A file is named by the asset its places show, not by its family.
  const row = (store.db
    .prepare('SELECT id, card, visibleFrom FROM docs WHERE audience = ? AND ref = ?')
    .get(request.audience, request.ref) ??
    (request.ref.startsWith('file:')
      ? store.db
          .prepare(
            "SELECT id, card, visibleFrom FROM docs WHERE audience = ? AND kind = 'file' AND json_extract(card, '$.file.assetUuid') = ?",
          )
          .get(request.audience, request.ref.slice('file:'.length))
      : undefined)) as Row | undefined;
  if (!row || row.visibleFrom > (request.now ?? Date.now())) return undefined;
  const query = parseSearchQuery(request.q, searchAnalyzer(), { typing: request.typing });
  const card = JSON.parse(row.card) as StoredCard;
  const { finds, more } = findsOf(
    store.units(row.id),
    query,
    { href: card.href },
    ALL_FINDS,
    request.audience === 'owner',
  );
  return { finds: finds.slice(0, ALL_FINDS), more };
}

export async function cachedSearch(request: SearchRequest): Promise<SearchResponse> {
  const store = useSearchStore();
  const { now: _now, ...asked } = request;
  const key = `${store.generation}\u0000${JSON.stringify(asked)}`;
  const known = cache.get(key);
  if (known && !known.building) {
    cache.delete(key);
    cache.set(key, known);
    return known;
  }
  const response = await runSearch(request);
  cache.set(key, response);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return response;
}
