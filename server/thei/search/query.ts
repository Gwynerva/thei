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
import {
  markedSegments,
  SEARCH_SNIPPET_LEAD,
  SEARCH_SNIPPET_LENGTH,
  snippetSegments,
  type SearchSegment,
} from '#layers/thei/shared/search/snippet';
import {
  answersQueryWord,
  isQuestion,
  parseSearchQuery,
  requiredQueryWords,
  searchTokens,
  type SearchQuery,
} from '#layers/thei/shared/search/tokens';
import { searchKey } from '#layers/thei/shared/search/match';
import { normalizeTermText } from '#layers/thei/shared/text-terms';
import { buildPublicTags } from '../public/entities';
import { runCatalogue } from './catalogue';
import { placeHref, type SearchAudience } from './documents';
import { searchAnalyzer } from './analyzer';
import { searchIndexProgress, useSearchStore } from './indexer';
import { ftsTerm, type SearchStore, type StoredCard } from './store';
import { SEARCH_FIELD_WEIGHTS, SEARCH_FIELDS, type SearchUnit } from './units';

/** How many of each kind the search answers at once when no kind is chosen. */
export const SEARCH_GROUP_SIZE = 3;
/** How many of a kind are weighed to choose those few. */
const SEARCH_GROUP_CANDIDATES = 12;
export { SEARCH_PAGE_SIZE };
/** Finds told of each entity on the search page. */
const PAGE_FINDS = 3;
/** A quick search's find is one short line: it opens a word or two before. */
const QUICK_SNIPPET_LEAD = 10;

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
  /** By days, newest or oldest first, rather than best first. */
  sort?: 'new' | 'old';
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

const WEIGHTS = SEARCH_FIELDS.map((field) => SEARCH_FIELD_WEIGHTS[field]).join(
  ', ',
);
/** The FTS5 query of the words a search insists on, and its phrases. */
/**
 * The query as FTS5 reads it: every word in one of its forms, and each
 * phrase in a row — or, with `any`, as few as one of them.
 */
function ftsMatch(query: SearchQuery, any = false): string | undefined {
  const parts = requiredQueryWords(query).map((word) => {
    const options = word.terms.map((term) => `"${ftsTerm(term)}"`);
    if (word.prefix) options.push(`"${ftsTerm(word.word)}"*`);
    return options.length > 1 ? `(${options.join(' OR ')})` : options[0]!;
  });
  // A word written with a capital stands in the index twice, as its stem and
  // as written (`searchIndexTerms`), so the words of a phrase are asked for
  // near one another rather than strictly in a row; the order is checked
  // where the words are marked.
  for (const phrase of query.phrases)
    parts.push(
      phrase.length > 1
        ? `NEAR(${phrase.map((term) => `"${ftsTerm(term)}"`).join(' ')}, ${phrase.length})`
        : `"${ftsTerm(phrase[0]!)}"`,
    );
  return parts.length ? parts.join(any ? ' OR ' : ' AND ') : undefined;
}

interface Filters {
  sql: string;
  params: unknown[];
}

function tagUuidsBySlug(slugs: string[] | undefined): string[] {
  if (!slugs?.length) return [];
  const { rawDb } = THEI_SERVER.useDb();
  return slugs.flatMap((slug) => {
    const row = rawDb
      .prepare('SELECT tagUuid FROM tags WHERE slug = ?')
      .get(slug) as { tagUuid: string } | undefined;
    return row ? [row.tagUuid] : [];
  });
}

/** The conditions every hit meets, but the kind and the year, which facets count across. */
function baseFilters(request: SearchRequest, store: SearchStore): Filters {
  const sql: string[] = ['d.visibleFrom <= ?'];
  const params: unknown[] = [request.now ?? Date.now()];
  for (const tag of tagUuidsBySlug(request.tags)) {
    sql.push(
      'EXISTS (SELECT 1 FROM doc_tags t WHERE t.doc = d.id AND t.tag = ?)',
    );
    params.push(tag);
  }
  for (const tag of tagUuidsBySlug(request.exclude)) {
    sql.push(
      'NOT EXISTS (SELECT 1 FROM doc_tags t WHERE t.doc = d.id AND t.tag = ?)',
    );
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

function narrowed(
  base: Filters,
  request: SearchRequest,
  kind = request.kind,
): Filters {
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
function dayMatcher(
  q: string,
  now: number,
): ((date: string) => number | undefined) | undefined {
  const shift = searchAnalyzer().relativeDay(normalizeTermText(q.trim()));
  if (shift !== undefined) {
    const day = utcDayOf(now + shift * 24 * 60 * 60 * 1000);
    return (date) => (date === day ? 0 : undefined);
  }
  const parsed = parseDayQuery(q);
  return parsed ? (date) => dayQueryRank(date, parsed) : undefined;
}

/** Whether a unit holds a phrase: its terms in a row. */
function phraseSpans(
  tokens: ReturnType<typeof searchTokens>,
  phrase: string[],
) {
  const spans: { start: number; end: number }[] = [];
  for (let at = 0; at + phrase.length <= tokens.length; at++)
    if (phrase.every((term, offset) => tokens[at + offset]!.term === term))
      spans.push({
        start: tokens[at]!.start,
        end: tokens[at + phrase.length - 1]!.end,
      });
  return spans;
}

function textFragment(href: string, words: string[]): string {
  if (!words.length) return href;
  const directive = `:~:text=${encodeURIComponent(words.join(' ')).replaceAll('-', '%2D')}`;
  return href.includes('#') ? `${href}${directive}` : `${href}#${directive}`;
}

/** Whether every phrase of a query stands in a row in one of the units. */
function holdsPhrases(units: SearchUnit[], query: SearchQuery): boolean {
  const analyzer = searchAnalyzer();
  const left = new Set(query.phrases);
  for (const unit of units) {
    if (unit.placeOnly) continue;
    const tokens = searchTokens(unit.text, analyzer, 'index');
    for (const phrase of left)
      if (phraseSpans(tokens, phrase).length) left.delete(phrase);
    if (!left.size) return true;
  }
  return false;
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
  /** How far before the words a snippet opens: less in a single line. */
  lead = SEARCH_SNIPPET_LEAD,
): { finds: SearchFind[]; more: number; closeness: number } {
  const analyzer = searchAnalyzer();
  // How close the text comes to what was typed: words as typed, not only
  // their stems, and the words standing together in the order typed.
  const asTyped = new Set<number>();
  let together = false;
  const words = query.words;
  // Words that only hold a sentence together count, and are marked, only in
  // a query made of nothing else: «где я была».
  const allStop = words.every((word) => word.stop);
  const counts = (word: (typeof words)[number]) => !word.stop || allStop;
  const probes = words.map((word) =>
    word.word.slice(0, Math.max(2, Math.min(word.word.length, 3))),
  );
  const found: {
    unit: SearchUnit;
    order: number;
    score: number;
    spans: { start: number; end: number }[];
    words: string[];
  }[] = [];
  units.forEach((unit, order) => {
    if (unit.placeOnly) return;
    const lower = normalizeTermText(unit.text);
    if (!probes.some((probe) => lower.includes(probe)) && !query.phrases.length)
      return;
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
        if (!counts(word)) return;
        spans.push({ start: token.start, end: token.end });
        const written = unit.text.slice(token.start, token.end);
        if (marked.length < 3 && !marked.includes(written))
          marked.push(written);
      });
      if (answeredHere > 0 && answeredHere === previous + 1) together = true;
      previous = answeredHere;
    }
    for (const phrase of query.phrases) {
      const at = phraseSpans(tokens, phrase);
      if (at.length) answered.add(words.length + query.phrases.indexOf(phrase));
      spans.push(...at);
      if (at[0] && !marked.length)
        marked.push(unit.text.slice(at[0].start, at[0].end));
    }
    const meaningful = [...answered].filter(
      (at) => at >= words.length || counts(words[at]!),
    ).length;
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
    const plain =
      unit.where === 'title' ||
      unit.where === 'summary' ||
      unit.where === 'name';
    shown.push({
      where: unit.where,
      ...(unit.place?.section && unit.where !== 'section'
        ? { label: unit.place.section.title }
        : unit.place?.relation
          ? { label: unit.place.relation.title }
          : unit.place?.status
            ? { label: unit.place.status.date }
            : unit.place?.file?.title
              ? { label: unit.place.file.title }
              : {}),
      href: plain || unit.hidden ? document.href : textFragment(at, item.words),
      segments: unit.hidden
        ? []
        : snippetSegments(unit.text, item.spans, SEARCH_SNIPPET_LENGTH, lead),
      ...(unit.media && (unit.where === 'file' || unit.where === 'caption')
        ? { media: unit.media }
        : {}),
      ...(withPlace &&
      unit.place &&
      (unit.place.section || unit.place.block || unit.place.file)
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

/**
 * The words of the query a title or a description holds, marked as a find's
 * words are, and how many of those that count it holds: a result named by
 * what was typed is the one sought before one that only says it somewhere.
 */
function titleWords(
  title: string | undefined,
  query: SearchQuery,
): { segments?: SearchSegment[]; held: number; of: number } {
  const allStop = query.words.every((word) => word.stop);
  const words = query.words.filter((word) => !word.stop || allStop);
  const of = words.length + query.phrases.length;
  if (!title) return { held: 0, of };
  const tokens = searchTokens(title, searchAnalyzer(), 'index');
  const held = new Set<number>();
  const spans = tokens
    .filter((token) => {
      const at = words.findIndex((word) => answersQueryWord(token, word));
      if (at >= 0) held.add(at);
      return at >= 0;
    })
    .map((token) => ({ start: token.start, end: token.end }));
  query.phrases.forEach((phrase, at) => {
    const found = phraseSpans(tokens, phrase);
    if (found.length) held.add(words.length + at);
    spans.push(...found);
  });
  spans.sort((a, b) => a.start - b.start);
  return {
    ...(spans.length ? { segments: markedSegments(title, spans) } : {}),
    held: held.size,
    of,
  };
}

function hitOf(row: DocRow, finds: SearchFind[], more: number): SearchHit {
  const card = JSON.parse(row.card) as StoredCard;
  return {
    kind: row.kind,
    // A file is named by the asset its places show: a stranger's slug, never
    // the family's storage id.
    ref:
      row.kind === 'file' && card.file
        ? `file:${card.file.assetUuid}`
        : row.ref,
    title: row.title,
    ...(card.parent ? { parent: card.parent } : {}),
    ...(card.shownAt ? { shownAt: card.shownAt } : {}),
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
  for (const tag of [...included, ...excluded])
    if (!counts.has(tag)) counts.set(tag, 0);
  if (!counts.size) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const tags = db
    .select()
    .from(schema.tags)
    .all()
    .filter((tag) => counts.has(tag.tagUuid));
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
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.tag.title.localeCompare(right.tag.title),
    );
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
    years: [...years]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
  };
}

/**
 * A query made only of words that hold a sentence together — «где я была» —
 * says nothing but in their order: it is read as a phrase, or every text with
 * an «я» in it would answer.
 */
function asPhrase(query: SearchQuery): SearchQuery {
  if (query.words.length < 2 || query.words.some((word) => !word.stop))
    return query;
  return {
    ...query,
    words: [],
    phrases: [...query.phrases, query.words.map((word) => word.term)],
  };
}

/**
 * The kind a query names beside its other words, and the query without
 * insisting on that word. None when the word stands alone: «фото» is then
 * a word like any other.
 */
function kindHint(query: SearchQuery): {
  kind?: SearchKind;
  query: SearchQuery;
} {
  const named = query.words.map((word) =>
    // Words that name a kind of result rather than say what it is about
    // (`kindWords`): beside other words, such a word need not stand in a
    // text, and its kind comes first.
    word.stop ? undefined : searchAnalyzer().kindOf(word.term),
  );
  const others = query.words.filter((word, at) => !word.stop && !named[at]);
  const kind = named.find(Boolean);
  if (!kind || !others.length) return { query };
  return {
    kind,
    query: {
      ...query,
      words: query.words.map((word, at) =>
        named[at] ? { ...word, stop: true } : word,
      ),
    },
  };
}

/** One search, as the index answers it now; with `any`, for some of the words. */
async function searchOnce(
  request: SearchRequest,
  store: SearchStore,
  text: string,
  any = false,
): Promise<SearchResponse> {
  const hint = kindHint(
    asPhrase(
      parseSearchQuery(text, searchAnalyzer(), { typing: request.typing }),
    ),
  );
  const query = hint.query;
  const match = ftsMatch(query, any);
  const now = request.now ?? Date.now();
  const days = dayMatcher(text, now);
  if (!match && !days)
    return runCatalogue(
      {
        q: '',
        ...(request.kind === 'project' || request.kind === 'event'
          ? { type: request.kind }
          : {}),
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
  const from = `${table} JOIN docs d ON d.id = ${table}.rowid`;
  // A phrase is asked of FTS by its words near one another (`ftsMatch`):
  // what holds them in another order is left out here, from the counts too,
  // so no group stands counted and empty.
  if (match && query.phrases.length && !query.words.length) {
    const near = store.db
      .prepare(
        `SELECT d.id FROM ${from} WHERE ${table} MATCH ? AND ${base.sql} LIMIT 2000`,
      )
      .pluck()
      .all(match, ...base.params) as number[];
    const apart = near.filter((id) => !holdsPhrases(store.units(id), query));
    if (apart.length) base.sql += ` AND d.id NOT IN (${apart.join(', ')})`;
  }
  const facetFilter = { sql: base.sql, params: base.params };
  const textRows = match
    ? (store.db
        .prepare(
          `SELECT d.kind, d.year, count(*) AS n FROM ${from} WHERE ${table} MATCH ? AND ${facetFilter.sql} GROUP BY d.kind, d.year`,
        )
        .all(match, ...facetFilter.params) as {
        kind: SearchKind;
        year: number | null;
        n: number;
      }[])
    : [];
  // A query that names a day finds the diary of that day, whatever it says.
  const dayRows = days
    ? (
        store.db
          .prepare(
            `SELECT d.id, d.kind, d.ref, d.title, d.date, d.card FROM docs d WHERE d.audience = ? AND d.kind = 'diary-entry' AND ${base.sql}`,
          )
          .all(request.audience, ...base.params) as DocRow[]
      )
        .map((row) => ({ row, rank: days(row.date ?? '') }))
        .filter(
          (item): item is { row: DocRow; rank: number } =>
            item.rank !== undefined,
        )
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            (b.row.date ?? '').localeCompare(a.row.date ?? ''),
        )
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
          .all(
            match,
            ...facetFilter.params,
            ...(request.year ? [request.year] : []),
          ) as number[])
      : [];
    const daysInYear = dayRows
      .filter(
        (row) =>
          !request.year || Number(row.date?.slice(0, 4)) === request.year,
      )
      .map((row) => row.id);
    const union = new Set([...textDiary, ...daysInYear]);
    facets.kinds['diary-entry'] = union.size;
  }
  const tagRows = match
    ? (store.db
        .prepare(
          `SELECT t.tag, count(*) AS n FROM ${from} JOIN doc_tags t ON t.doc = d.id WHERE ${table} MATCH ? AND ${narrowed(base, request).sql} GROUP BY t.tag`,
        )
        .all(match, ...narrowed(base, request).params) as {
        tag: string;
        n: number;
      }[])
    : [];

  const findsLimit = request.quick ? 1 : PAGE_FINDS;
  /**
   * The hits of a few rows, those closest to what was typed first: bm25 reads
   * stems only, so a word as typed and words standing together reorder the
   * candidates it brought.
   */
  // Named as typed: the very words, or the same words in other forms —
  // «бублика» names the tag «Бублик».
  const typed = searchKey(query.text);
  const termsOf = (text: string) =>
    searchTokens(text, searchAnalyzer(), 'query')
      .map((token) => token.term)
      .join(' ');
  const typedTerms = termsOf(query.text);
  const exact = (title: string) =>
    Boolean(typed) &&
    (searchKey(title) === typed || termsOf(title) === typedTerms);
  // Read by days, as the reader asked: each kind's few, or a page of one.
  const byDate = Boolean(request.sort);
  // The results whose names hold every word, by ref: their kind comes up.
  const fullyNamed = new Set<string>();
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
          request.quick ? QUICK_SNIPPET_LEAD : SEARCH_SNIPPET_LEAD,
        );
        const day = dayIds.has(row.id);
        if (day)
          finds.unshift({
            where: 'day',
            label: row.date ?? '',
            href: card.href,
            segments: [],
          });
        // The very name typed is the one sought, whatever else says the words;
        // then a name that holds them all, then one that holds some.
        const named = exact(row.title);
        const hit = hitOf(row, finds.slice(0, findsLimit), more);
        // A file with no title is called by its description.
        const shownTitle =
          row.kind === 'diary-entry'
            ? ''
            : row.title || (row.kind === 'file' ? card.summary : '');
        const inTitle = titleWords(shownTitle, query);
        const inSummary =
          row.title && card.summary
            ? titleWords(card.summary, query)
            : undefined;
        const whole = inTitle.held > 0 && inTitle.held === inTitle.of;
        if (whole) fullyNamed.add(hit.ref);
        const naming = whole ? 12 : inTitle.held * 4;
        const dated = !byDate
          ? undefined
          : row.kind === 'tag'
            ? (() => {
                const day = tagDay(row.ref);
                return day
                  ? {
                      by: newest
                        ? ('last-used' as const)
                        : ('first-used' as const),
                      day,
                    }
                  : undefined;
              })()
            : card.dated;
        return {
          hit: {
            ...hit,
            ...(dated ? { dated } : {}),
            ...(inTitle.segments ? { titleSegments: inTitle.segments } : {}),
            ...(inSummary?.segments
              ? { summarySegments: inSummary.segments }
              : {}),
          },
          order,
          closeness: day || named ? 100 : closeness + naming,
        };
      })
      .sort(
        (a, b) => (byDate ? 0 : b.closeness - a.closeness) || a.order - b.order,
      )
      .slice(0, keep)
      .map((item) => item.hit);
  const today = utcDayOf(now);
  /**
   * The order of a kind read by days. What has days of a life comes first,
   * by them — newest by where it ends, never past today, so what still runs
   * is now and its end stays unsaid; oldest by where it begins — then what
   * has only the day it was made. A tag goes by what carries it: its last
   * use, or its first.
   */
  const newest = request.sort !== 'old';
  // What carries a tag, as this reader finds it: «tag:<uuid>» names it.
  const tagUse = {
    sql: `(SELECT ${newest ? 'max(min(c.sortTo, ?))' : 'min(c.sortFrom)'}
      FROM doc_tags t JOIN docs c ON c.id = t.doc
      WHERE t.tag = substr(d.ref, 5) AND c.audience = d.audience
        AND c.sortLife = 1 AND c.visibleFrom <= ?)`,
    params: newest ? [today, now] : [now],
  };
  const dayOrder = (kind: SearchKind): { sql: string; params: unknown[] } => {
    if (kind === 'tag')
      return {
        sql: `${tagUse.sql} IS NULL, ${tagUse.sql} ${newest ? 'DESC' : 'ASC'}, `,
        params: [...tagUse.params, ...tagUse.params],
      };
    return newest
      ? {
          sql: 'd.sortTo IS NULL, d.sortLife DESC, min(d.sortTo, ?) DESC, ',
          params: [today],
        }
      : {
          sql: 'd.sortFrom IS NULL, d.sortLife DESC, d.sortFrom ASC, ',
          params: [],
        };
  };
  /** The day a tag was last used, or first, as its card says when sorted. */
  const tagDay = (ref: string): string | undefined =>
    (
      store.db
        .prepare(
          `SELECT ${tagUse.sql} AS day FROM docs d WHERE d.audience = ? AND d.ref = ?`,
        )
        .get(...tagUse.params, request.audience, ref) as
        { day: string | null } | undefined
    )?.day ?? undefined;
  const ranked = (
    kind: SearchKind,
    limit: number,
    offset: number,
  ): DocRow[] => {
    const filters = narrowed(base, request, kind);
    const order = byDate ? dayOrder(kind) : { sql: '', params: [] };
    // The diary of a day the query names comes first, then the text's hits.
    const mergesDays = kind === 'diary-entry' && dayRows.length > 0;
    const textHits = match
      ? (store.db
          .prepare(
            `SELECT d.id, d.kind, d.ref, d.title, d.date, d.card FROM ${from}
             WHERE ${table} MATCH ? AND ${filters.sql}
             ORDER BY ${order.sql}bm25(${table}, ${WEIGHTS}) LIMIT ? OFFSET ?`,
          )
          .all(
            match,
            ...filters.params,
            ...order.params,
            mergesDays ? offset + limit + dayRows.length : limit,
            mergesDays ? 0 : offset,
          ) as DocRow[])
      : [];
    if (!mergesDays) return textHits;
    const merged = [
      ...dayRows.filter(
        (row) =>
          !request.year || Number(row.date?.slice(0, 4)) === request.year,
      ),
    ];
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
    const rows =
      total && offset < total ? ranked(request.kind, size, offset) : [];
    groups = rows.length
      ? [{ kind: request.kind, total, hits: hydrate(rows) }]
      : [];
  } else {
    groups = kinds.map((kind) => ({
      kind,
      total: facets.kinds[kind] ?? 0,
      hits: hydrate(
        ranked(
          kind,
          Math.max(SEARCH_GROUP_CANDIDATES, (request.groupSize ?? 0) * 2),
          0,
        ),
        request.groupSize ?? SEARCH_GROUP_SIZE,
      ),
    }));
    // A result named exactly as typed brings its kind to the top: «где я
    // была» is the page of that name before the projects that say the words.
    // A kind the query names comes next, then kinds whose best result holds
    // every word in its name: «пластика» finds the section «Рога из
    // пластика» before the project that only lists it.
    // A section is a part: named exactly, it still stands after the whole
    // named in full — «шлем» is the project «Шлем пилота меха» before the
    // section «Шлем» of another one.
    const rank = (group: SearchGroup) => {
      const top = group.hits[0];
      if (!top) return 0;
      if (exact(top.title) && group.kind !== 'project-section') return 3;
      if (group.kind === hint.kind) return 2;
      return fullyNamed.has(top.ref) ? 1 : 0;
    };
    groups = groups
      .map((group, order) => ({ group, order, rank: rank(group) }))
      .sort((a, b) => b.rank - a.rank || a.order - b.order)
      .map((item) => item.group);
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
export async function runSearch(
  request: SearchRequest,
): Promise<SearchResponse> {
  const store = useSearchStore();
  const building = searchIndexProgress();
  const words = (text: string) => {
    const query = parseSearchQuery(text, searchAnalyzer(), {
      typing: request.typing,
    });
    return requiredQueryWords(query).length + query.phrases.length;
  };
  // A question holds words that only carry it — «что я делала на байкале»:
  // what holds the rarer of them leads, though it lacks «делала».
  const asked = isQuestion(request.q, searchAnalyzer()) && words(request.q) > 1;
  const response = await searchOnce(request, store, request.q, asked);
  if (!response.total && response.query) {
    const other = searchAnalyzer().otherKeyboard(normalizeTermText(request.q));
    if (other && other !== normalizeTermText(request.q)) {
      const again = await searchOnce(request, store, other);
      if (again.total)
        return { ...again, keyboard: other, ...(building ? { building } : {}) };
    }
    // Not all the words together: what holds some of them, said so — the
    // one word of several a text lacks need not leave a reader with nothing.
    if (!asked && words(request.q) > 1) {
      const some = await searchOnce(request, store, request.q, true);
      if (some.total)
        return { ...some, partial: true, ...(building ? { building } : {}) };
    }
  }
  return building ? { ...response, building } : response;
}

const CACHE_LIMIT = 500;
const cache = new Map<string, SearchResponse>();

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
    .prepare(
      'SELECT id, card, visibleFrom FROM docs WHERE audience = ? AND ref = ?',
    )
    .get(request.audience, request.ref) ??
    (request.ref.startsWith('file:')
      ? store.db
          .prepare(
            "SELECT id, card, visibleFrom FROM docs WHERE audience = ? AND kind = 'file' AND json_extract(card, '$.file.assetUuid') = ?",
          )
          .get(request.audience, request.ref.slice('file:'.length))
      : undefined)) as Row | undefined;
  if (!row || row.visibleFrom > (request.now ?? Date.now())) return undefined;
  const query = parseSearchQuery(request.q, searchAnalyzer(), {
    typing: request.typing,
  });
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

/**
 * `runSearch`, remembered: the last answers, each for the index's generation
 * it was made at, so an answer never outlives a change of what it shows.
 */
export async function cachedSearch(
  request: SearchRequest,
): Promise<SearchResponse> {
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
