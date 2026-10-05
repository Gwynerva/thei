import type { ContentEntityType } from '../content-link';
import { dayQueryRank, parseDayQuery, type DayQuery } from '../day-query';
import type { MediaDescriptor } from '../media';
import {
  containsPhrase,
  inverseDocumentFrequency,
  normalizeTermText,
  stemTerm,
  wordTokens,
} from '../text-terms';

export type ContentEntitySearchItem = {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  summary: string;
  url: string;
  humanReadableSlug: string;
  publicId?: string;
  /** The day of a diary entry, which stands in for its missing title. */
  date?: string;
  /** The project a section belongs to. */
  parent?: { title: string; href: string };
  updatedAt: number;
  previewMedia?: MediaDescriptor;
};

/**
 * What a picker needs to show an entity as its choice: a search result, or
 * the target of a link being edited, described by the link resolver.
 */
export type ContentEntityChoice = Pick<
  ContentEntitySearchItem,
  'entityType' | 'entityId' | 'title' | 'summary' | 'date' | 'parent'
> & { previewMedia?: MediaDescriptor };

/** How many results a picker shows unless it asks for more. */
export const CONTENT_ENTITY_SEARCH_LIMIT = 5;
/** The most a picker may ask for. */
export const CONTENT_ENTITY_SEARCH_MAX_LIMIT = 20;
/** How much of the text a link is made over a picker reads for suggestions. */
export const CONTENT_ENTITY_SUGGEST_TEXT_LIMIT = 300;

/**
 * The entities named by `type:uuid` keys — the ones a text links to, say —
 * in the order the keys give, `limit` at most. A key that names nothing on
 * offer is skipped, and a repeated one counts once.
 */
export function pickContentEntities<
  T extends Pick<ContentEntitySearchItem, 'entityType' | 'entityId'>,
>(items: T[], keys: readonly string[], limit: number): T[] {
  const byKey = new Map(
    items.map((item) => [`${item.entityType}:${item.entityId}`, item]),
  );
  return [
    ...new Set(
      keys.flatMap((key) => {
        const item = byKey.get(key);
        return item ? [item] : [];
      }),
    ),
  ].slice(0, limit);
}

type Rankable = {
  title: string;
  humanReadableSlug: string;
  publicId?: string;
  date?: string;
  updatedAt: number;
};

export function rankContentEntities<T extends Rankable>(
  items: T[],
  query: string,
  limit = CONTENT_ENTITY_SEARCH_LIMIT,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized)
    return [...items]
      .sort(
        (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
      )
      .slice(0, limit);
  const day = parseDayQuery(query);
  return (
    items
      .map((item) => ({ item, rank: bestRank(item, normalized, day) }))
      .filter(({ rank }) => Number.isFinite(rank))
      // Diary entries found equally well come newest first: of the days of a
      // month or a year, the recent ones are the likely link.
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          (b.item.date ?? '').localeCompare(a.item.date ?? '') ||
          a.item.title.localeCompare(b.item.title),
      )
      .slice(0, limit)
      .map(({ item }) => item)
  );
}

/**
 * How well an entity answers a query, lower being better: by its title, then
 * its public ID, then its slug — the whole of one, its start, or any part of
 * it; 0 to 2 for the title, 10 to 12 for the public ID, and so on.
 *
 * A diary entry has no name to search by, only its day, written however the
 * person is used to (`day-query.ts`): a whole day as written ranks with a
 * whole title, a month or a year with a title found in part.
 */
function bestRank(item: Rankable, query: string, day?: DayQuery) {
  if (item.date)
    return (day && dayQueryRank(item.date, day)) ?? Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  [item.title, item.publicId, item.humanReadableSlug].forEach(
    (value, index) => {
      if (!value) return;
      const field = value.toLocaleLowerCase();
      const rank =
        field === query
          ? 0
          : field.startsWith(query)
            ? 1
            : field.includes(query)
              ? 2
              : 3;
      if (rank < 3) best = Math.min(best, index * 10 + rank);
    },
  );
  return best;
}

type Suggestible = Rankable & { summary: string };

/** What an entity says about itself, as words to compare. */
type SuggestProfile = {
  /** The words of the title; none for a diary entry, whose title is its day. */
  titleWords: string[];
  titleStems: Set<string>;
  summaryStems: Set<string>;
  /** The title as a phrase to look for in the text, and to find the text in. */
  titlePhrase: string;
};

/** Case and runs of space set aside, for comparing phrases. */
function normalizePhrase(value: string) {
  return normalizeTermText(value).replace(/\s+/g, ' ').trim();
}

function suggestProfile(item: Suggestible): SuggestProfile {
  const titleWords = item.date ? [] : wordTokens(item.title);
  return {
    titleWords,
    titleStems: new Set(titleWords.map(stemTerm)),
    summaryStems: new Set(wordTokens(item.summary).map(stemTerm)),
    titlePhrase: item.date ? '' : normalizePhrase(item.title),
  };
}

/**
 * What a picker opened over some words offers before anything is typed into
 * it: the entities those words name, the closest first, then the most recent
 * ones, `limit` in all.
 *
 * The words are a search in which any one of them may match — «we sailed to
 * Lantern Harbor» finds «Lantern Harbor». A word matches a word of a title in
 * any of its forms, or the start of a longer one, and more weakly a word of
 * the summary; a diary entry, named by its day, matches by its words only.
 * Every word counts, short ones too, since a character may well be called
 * «2B». What keeps «и», «в» or «the» from pulling in whatever contains them is
 * how common a word is, not how short: a word found across a large share of
 * the archive matches nothing on its own. A title found whole in the text,
 * or the whole text found in a title, comes before any match by words.
 */
export function suggestContentEntities<T extends Suggestible>(
  items: T[],
  text: string,
  limit = CONTENT_ENTITY_SEARCH_LIMIT,
): T[] {
  const recent = rankContentEntities(items, '', items.length);
  const source = Array.from(text)
    .slice(0, CONTENT_ENTITY_SUGGEST_TEXT_LIMIT)
    .join('');
  const tokens = [...new Set(wordTokens(source))];
  const phrase = normalizePhrase(source);
  if (!tokens.length && !phrase) return recent.slice(0, limit);

  const profiles = items.map(suggestProfile);
  const frequency = new Map<string, number>();
  for (const profile of profiles)
    for (const stem of new Set([
      ...profile.titleStems,
      ...profile.summaryStems,
    ]))
      frequency.set(stem, (frequency.get(stem) ?? 0) + 1);
  const common = Math.max(3, items.length / 3);
  const isCommon = (stem: string) => (frequency.get(stem) ?? 0) > common;
  const idf = (stem: string) =>
    inverseDocumentFrequency(items.length, frequency.get(stem) ?? 0);
  const terms = tokens
    .map((token) => ({ token, stem: stemTerm(token) }))
    .filter(({ stem }) => !isCommon(stem));

  const matched = items
    .map((item, index) => {
      const profile = profiles[index]!;
      let title = 0;
      let summary = 0;
      const titleMatched = new Set<string>();
      for (const { token, stem } of terms) {
        const weight = idf(stem);
        if (profile.titleStems.has(stem)) {
          title += 3 * weight;
          titleMatched.add(stem);
        } else if (
          token.length >= 3 &&
          profile.titleWords.some((word) => word.startsWith(token))
        )
          title += 2 * weight;
        else if (profile.summaryStems.has(stem)) summary += weight;
      }
      // A title matched in full outweighs a long one sharing a single word.
      let titleWeight = 0;
      let titleCovered = 0;
      for (const stem of profile.titleStems) {
        titleWeight += idf(stem);
        if (titleMatched.has(stem)) titleCovered += idf(stem);
      }
      const coverage = titleWeight ? titleCovered / titleWeight : 0;
      const whole =
        profile.titlePhrase.length >= 2 &&
        phrase.length >= 2 &&
        // A title of common words only, such as «The», is no name to find.
        (!profile.titleStems.size ||
          [...profile.titleStems].some((stem) => !isCommon(stem))) &&
        (containsPhrase(phrase, profile.titlePhrase) ||
          containsPhrase(profile.titlePhrase, phrase));
      return {
        item,
        whole,
        score: title * (0.5 + 0.5 * coverage) + summary,
      };
    })
    .filter(({ whole, score }) => whole || score > 0)
    .sort(
      (a, b) =>
        Number(b.whole) - Number(a.whole) ||
        b.score - a.score ||
        b.item.updatedAt - a.item.updatedAt ||
        a.item.title.localeCompare(b.item.title),
    )
    .slice(0, limit)
    .map(({ item }) => item);

  const taken = new Set<T>(matched);
  return [
    ...matched,
    ...recent
      .filter((item) => !taken.has(item))
      .slice(0, limit - matched.length),
  ];
}
