import type { MediaDescriptor } from './media';
import type { RelationEndpoint } from './relation';
import type { TagContainerType, TagItem } from './tag';
import {
  containsPhrase,
  cosineSimilarity,
  normalizeTermText,
  stemTerm,
  wordTokens,
  type TermCounts,
  type TermVector,
} from './text-terms';

/**
 * How much of an entity's text a recommendation reads. A project with many
 * stages and sections easily runs past a few dozen pages; the beginning of it
 * says enough about what it is, and the rest is cut rather than refused.
 */
export const TAG_RECOMMENDATION_TEXT_MAX_LENGTH = 100_000;

/**
 * Every threshold of tag recommendations in one place.
 *
 * Four kinds of evidence point at a tag, each scored from 0 to 1: its name in
 * the text, similar entities carrying it, related entities carrying it, and
 * tags it usually goes with. They are combined as independent chances
 * ("noisy OR"), so two weak hints add up to a firmer one, and no amount of
 * them goes past certainty.
 */
export const TAG_RECOMMENDATION = {
  limit: 8,
  /** Below this a tag is not worth showing. */
  minScore: 0.3,
  /** From this on a tag is worth reminding of when an entity has none. */
  strongScore: 0.6,
  weights: { text: 0.9, similar: 0.8, related: 0.5, together: 0.45 },
  /** How many of the most similar tagged entities vote. */
  neighbours: 10,
  /** Less similar than this is not similar at all. */
  minSimilarity: 0.08,
  /** One neighbour this similar is enough evidence on its own. */
  confidentSimilarity: 0.35,
  /** Votes are shared out of at least this much similarity, so a few faint neighbours cannot decide. */
  similarityFloor: 0.6,
  /** Tags seen together fewer times than this are a coincidence. */
  minTogether: 2,
  /** …and so is a tag that goes with the others no more often than with anything. */
  minLift: 1.5,
  /** How many of the rarest words of a tag's description stand for it. */
  descriptionTerms: 8,
  /** How much a description, not the name, can say for a tag. */
  descriptionWeight: 0.5,
  /** How many entities a reason names. */
  reasonEntities: 3,
} as const;

/** What an entity says about itself, as tag recommendations read it. */
export type TagContext = {
  title: string;
  /** Everything else it says, in reading order. */
  text: string;
};

export type TagRecommendationRequest = TagContext & {
  /** The entity being edited, kept out of its own evidence; absent until created. */
  owner?: { type: TagContainerType; id: string };
  selectedTagUuids: string[];
  /** Entities it is related to, including relations not saved yet. */
  related: RelationEndpoint[];
};

export type TagRecommendationEntity = {
  type: TagContainerType;
  id: string;
  title: string;
};

export type TagRecommendationReason =
  | { kind: 'text'; terms: string[] }
  | { kind: 'similar'; entities: TagRecommendationEntity[] }
  | { kind: 'related'; entities: TagRecommendationEntity[] }
  | { kind: 'together'; tags: string[] };

export type TagRecommendation = TagItem & {
  /** From 0 to 1. */
  score: number;
  reasons: TagRecommendationReason[];
};

export function clampTagContextText(text: string): string {
  return text.length > TAG_RECOMMENDATION_TEXT_MAX_LENGTH
    ? text.slice(0, TAG_RECOMMENDATION_TEXT_MAX_LENGTH)
    : text;
}

/** Joins the parts of an entity's text that are there, in reading order. */
export function joinTagContextText(
  parts: Array<string | null | undefined>,
): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n');
}

export function tagEntityKey(entity: { type: string; id: string }) {
  return `${entity.type}:${entity.id}`;
}

/** A project or an event as evidence for its tags. */
export type TagEvidenceDocument = TagRecommendationEntity & {
  key: string;
  tagUuids: string[];
  terms: TermCounts;
  vector: TermVector;
};

type TagNamePart = { stems: string[]; phrase?: string };

/** How a tag is recognized in a text. */
export type TagProfile = {
  tagUuid: string;
  title: string;
  /**
   * The name, and every alias written in brackets after it — «Доступность
   * (a11y)» is found by either. A name listing several things — «C++, .NET &
   * API» — is split into them.
   */
  names: TagNamePart[][];
  /** The rarest words of the description, not already in the name. */
  descriptionStems: string[];
  /** Each stem as the tag itself writes it, to name a match found by stem. */
  words: Map<string, string>;
};

const NAME_ALIAS = /\(([^)]*)\)/gu;
const NAME_LIST = /\s*[,&/|;]\s*/u;
const PLAIN_WORDS = /^[\p{L}\p{N}\s]*$/u;

function nameParts(name: string): TagNamePart[] {
  return name
    .split(NAME_LIST)
    .map((part) => normalizeTermText(part).trim())
    .filter(Boolean)
    .map((part) => ({
      stems: [...new Set(wordTokens(part).map(stemTerm))].filter(
        (stem) => stem.length > 1,
      ),
      // A name made of more than words is also looked for as it is written.
      ...(PLAIN_WORDS.test(part) ? {} : { phrase: part }),
    }))
    .filter((part) => part.stems.length || part.phrase);
}

export function buildTagProfile(
  tag: { tagUuid: string; title: string; description?: string },
  idf: (term: string) => number,
): TagProfile {
  const aliases = [...tag.title.matchAll(NAME_ALIAS)].map((match) => match[1]!);
  const names = [tag.title.replace(NAME_ALIAS, ' '), ...aliases]
    .map(nameParts)
    .filter((parts) => parts.length);
  const nameStems = new Set(names.flat().flatMap((part) => part.stems));
  const words = new Map<string, string>();
  for (const token of wordTokens(`${tag.title} ${tag.description ?? ''}`)) {
    const stem = stemTerm(token);
    if (!words.has(stem)) words.set(stem, token);
  }
  const descriptionStems = [
    ...new Set(wordTokens(tag.description ?? '').map(stemTerm)),
  ]
    .filter((stem) => stem.length > 2 && !nameStems.has(stem))
    .sort((left, right) => idf(right) - idf(left))
    .slice(0, TAG_RECOMMENDATION.descriptionTerms);
  return {
    tagUuid: tag.tagUuid,
    title: tag.title,
    names,
    descriptionStems,
    words,
  };
}

/**
 * How much of a set of stems a text holds, each stem weighed by how rare it
 * is: a name whose only missing word is «the» is still all there.
 */
function coverage(
  stems: string[],
  terms: TermCounts,
  idf: (term: string) => number,
) {
  let total = 0;
  let present = 0;
  for (const stem of stems) {
    const weight = idf(stem);
    total += weight;
    if (terms.has(stem)) present += weight;
  }
  return total ? present / total : 0;
}

/**
 * The tag's name in the text: all of it counts fully, most of it counts by
 * half, and a word that merely contains the name — «said» for «AI» — does not
 * count at all. `normalizedText` enables looking for names written with more
 * than letters; without it only words are compared.
 */
export function tagTextSignal(
  profile: TagProfile,
  text: {
    terms: TermCounts;
    normalizedText?: string;
    surfaces?: Map<string, string>;
  },
  idf: (term: string) => number,
): { score: number; terms: string[] } | undefined {
  let best = 0;
  let matched: string[] = [];
  for (const parts of profile.names) {
    let sum = 0;
    const terms: string[] = [];
    for (const part of parts) {
      if (
        part.phrase &&
        text.normalizedText !== undefined &&
        containsPhrase(text.normalizedText, part.phrase)
      ) {
        sum += 1;
        terms.push(part.phrase);
        continue;
      }
      const partCoverage = coverage(part.stems, text.terms, idf);
      sum += partCoverage;
      if (partCoverage)
        terms.push(
          ...part.stems
            .filter((stem) => text.terms.has(stem))
            .map(
              (stem) =>
                text.surfaces?.get(stem) ?? profile.words.get(stem) ?? stem,
            ),
        );
    }
    const nameCoverage = sum / parts.length;
    const score =
      nameCoverage >= 0.9 ? 1 : nameCoverage >= 0.5 ? nameCoverage / 2 : 0;
    if (score > best) {
      best = score;
      matched = terms;
    }
  }
  const described = profile.descriptionStems.filter((stem) =>
    text.terms.has(stem),
  );
  if (described.length >= 2) {
    const score =
      TAG_RECOMMENDATION.descriptionWeight *
      Math.min(1, 2 * coverage(profile.descriptionStems, text.terms, idf));
    if (score > best) {
      best = score;
      matched = described.map(
        (stem) => text.surfaces?.get(stem) ?? profile.words.get(stem) ?? stem,
      );
    }
  }
  return best ? { score: best, terms: [...new Set(matched)] } : undefined;
}

type EntitySignal = { score: number; entities: TagRecommendationEntity[] };

const entityOf = ({ type, id, title }: TagRecommendationEntity) => ({
  type,
  id,
  title,
});

/**
 * Tags of the most similar tagged entities, each weighed by how similar the
 * entity is: "entities like this one were tagged so". Untagged entities do not
 * vote — a forgotten tag is not a vote against it.
 */
export function similarTagSignal(
  vector: TermVector,
  documents: TagEvidenceDocument[],
  ownerKey?: string,
): Map<string, EntitySignal> {
  const neighbours = documents
    .filter((document) => document.key !== ownerKey && document.tagUuids.length)
    .map((document) => ({
      document,
      similarity: cosineSimilarity(vector, document.vector),
    }))
    .filter(({ similarity }) => similarity >= TAG_RECOMMENDATION.minSimilarity)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, TAG_RECOMMENDATION.neighbours);
  const total = Math.max(
    TAG_RECOMMENDATION.similarityFloor,
    neighbours.reduce((sum, { similarity }) => sum + similarity, 0),
  );
  const votes = new Map<
    string,
    { support: number; best: number; documents: TagEvidenceDocument[] }
  >();
  for (const { document, similarity } of neighbours) {
    for (const tagUuid of document.tagUuids) {
      const vote = votes.get(tagUuid) ?? { support: 0, best: 0, documents: [] };
      vote.support += similarity;
      vote.best = Math.max(vote.best, similarity);
      vote.documents.push(document);
      votes.set(tagUuid, vote);
    }
  }
  const signals = new Map<string, EntitySignal>();
  for (const [tagUuid, vote] of votes) {
    if (
      vote.documents.length < 2 &&
      vote.best < TAG_RECOMMENDATION.confidentSimilarity
    )
      continue;
    signals.set(tagUuid, {
      score: Math.min(1, vote.support / total),
      entities: vote.documents
        .slice(0, TAG_RECOMMENDATION.reasonEntities)
        .map(entityOf),
    });
  }
  return signals;
}

/** Tags of the projects and events an entity is related to. */
export function relatedTagSignal(
  related: TagEvidenceDocument[],
): Map<string, EntitySignal> {
  const signals = new Map<string, EntitySignal>();
  for (const document of related) {
    for (const tagUuid of document.tagUuids) {
      const signal = signals.get(tagUuid) ?? { score: 1, entities: [] };
      if (signal.entities.length < TAG_RECOMMENDATION.reasonEntities)
        signal.entities.push(entityOf(document));
      signals.set(tagUuid, signal);
    }
  }
  return signals;
}

/**
 * Tags that usually go with the ones already chosen: the share of entities
 * carrying a chosen tag that also carry this one. A tag found on nearly
 * everything goes with everything, so it has to go with the chosen tags
 * noticeably more often than with the rest.
 */
export function togetherTagSignal(
  documents: TagEvidenceDocument[],
  selected: ReadonlySet<string>,
  ownerKey?: string,
): Map<string, { score: number; tagUuids: string[] }> {
  const tagged = documents.filter(
    (document) => document.key !== ownerKey && document.tagUuids.length,
  );
  const counts = new Map<string, number>();
  const pairs = new Map<string, Map<string, number>>();
  for (const document of tagged) {
    const chosen = document.tagUuids.filter((tagUuid) => selected.has(tagUuid));
    for (const tagUuid of document.tagUuids) {
      counts.set(tagUuid, (counts.get(tagUuid) ?? 0) + 1);
      if (selected.has(tagUuid)) continue;
      for (const selectedUuid of chosen) {
        const withTag = pairs.get(tagUuid) ?? new Map<string, number>();
        withTag.set(selectedUuid, (withTag.get(selectedUuid) ?? 0) + 1);
        pairs.set(tagUuid, withTag);
      }
    }
  }
  const signals = new Map<string, { score: number; tagUuids: string[] }>();
  for (const [tagUuid, withTag] of pairs) {
    const base = (counts.get(tagUuid) ?? 0) / tagged.length;
    let score = 0;
    const because: string[] = [];
    for (const [selectedUuid, together] of withTag) {
      if (together < TAG_RECOMMENDATION.minTogether) continue;
      const share = together / (counts.get(selectedUuid) ?? together);
      if (share < TAG_RECOMMENDATION.minLift * base) continue;
      score = Math.max(score, share);
      because.push(selectedUuid);
    }
    if (score) signals.set(tagUuid, { score, tagUuids: because });
  }
  return signals;
}

export type TagEvidence = {
  text?: { score: number; terms: string[] };
  similar?: EntitySignal;
  related?: EntitySignal;
  together?: { score: number; tagUuids: string[] };
};

/** The evidence for one tag, combined into one score and its reasons. */
export function combineTagEvidence(
  evidence: TagEvidence,
  tagTitle: (tagUuid: string) => string | undefined,
): { score: number; reasons: TagRecommendationReason[] } {
  const { weights } = TAG_RECOMMENDATION;
  const chances = [
    weights.text * (evidence.text?.score ?? 0),
    weights.similar * (evidence.similar?.score ?? 0),
    weights.related * (evidence.related?.score ?? 0),
    weights.together * (evidence.together?.score ?? 0),
  ];
  const score = 1 - chances.reduce((rest, chance) => rest * (1 - chance), 1);
  const reasons: TagRecommendationReason[] = [];
  if (evidence.text) reasons.push({ kind: 'text', terms: evidence.text.terms });
  if (evidence.related)
    reasons.push({ kind: 'related', entities: evidence.related.entities });
  if (evidence.similar)
    reasons.push({ kind: 'similar', entities: evidence.similar.entities });
  if (evidence.together) {
    const tags = evidence.together.tagUuids
      .map(tagTitle)
      .filter((title): title is string => Boolean(title));
    if (tags.length) reasons.push({ kind: 'together', tags });
  }
  return { score, reasons };
}

/** What recommendations know about the entity being edited. */
export type TagDraft = {
  ownerKey?: string;
  terms: TermCounts;
  surfaces: Map<string, string>;
  normalizedText: string;
  vector: TermVector;
  selectedTagUuids: ReadonlySet<string>;
  related: TagEvidenceDocument[];
};

/** The tags worth recommending for a draft, best first. */
export function recommendTags(
  draft: TagDraft,
  corpus: {
    documents: TagEvidenceDocument[];
    profiles: TagProfile[];
    idf: (term: string) => number;
  },
): Array<{
  tagUuid: string;
  score: number;
  reasons: TagRecommendationReason[];
}> {
  const similar = similarTagSignal(
    draft.vector,
    corpus.documents,
    draft.ownerKey,
  );
  const related = relatedTagSignal(draft.related);
  const together = togetherTagSignal(
    corpus.documents,
    draft.selectedTagUuids,
    draft.ownerKey,
  );
  const titles = new Map(
    corpus.profiles.map((profile) => [profile.tagUuid, profile.title]),
  );
  return corpus.profiles
    .filter((profile) => !draft.selectedTagUuids.has(profile.tagUuid))
    .map((profile) => ({
      profile,
      ...combineTagEvidence(
        {
          text: tagTextSignal(profile, draft, corpus.idf),
          similar: similar.get(profile.tagUuid),
          related: related.get(profile.tagUuid),
          together: together.get(profile.tagUuid),
        },
        (tagUuid) => titles.get(tagUuid),
      ),
    }))
    .filter(({ score }) => score >= TAG_RECOMMENDATION.minScore)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.profile.title.localeCompare(right.profile.title, undefined, {
          sensitivity: 'base',
        }),
    )
    .slice(0, TAG_RECOMMENDATION.limit)
    .map(({ profile, score, reasons }) => ({
      tagUuid: profile.tagUuid,
      score,
      reasons,
    }));
}

/** How many entities the tag page offers a tag to. */
export const TAG_CANDIDATE_LIMIT = 10;

export type TagCandidate = TagRecommendationEntity & {
  score: number;
  reasons: TagRecommendationReason[];
};

/** A candidate as the tag page lists it, with the picture of the entity. */
export type TagCandidateItem = TagCandidate & { previewMedia: MediaDescriptor };

/**
 * Projects and events without a tag that it seems to fit, best first — what
 * a tag created today should also have been given years ago.
 *
 * The same four kinds of evidence as recommendations, turned around. Instead
 * of asking every entity's neighbours, which would compare everything with
 * everything, an entity is compared with what sets the entities carrying the
 * tag apart from the rest of the archive.
 */
export function tagCandidates(
  profile: TagProfile,
  corpus: {
    documents: TagEvidenceDocument[];
    byKey: ReadonlyMap<string, TagEvidenceDocument>;
    relations: ReadonlyMap<string, string[]>;
    idf: (term: string) => number;
  },
  tagTitle: (tagUuid: string) => string | undefined,
): TagCandidate[] {
  const { tagUuid } = profile;
  const carriers = corpus.documents.filter((document) =>
    document.tagUuids.includes(tagUuid),
  );
  const direction =
    carriers.length >= 2
      ? tagDirection(
          carriers,
          corpus.documents.filter(
            (document) => !document.tagUuids.includes(tagUuid),
          ),
        )
      : undefined;

  // How often the tag goes with each other tag, for "often with".
  const tagged = corpus.documents.filter(
    (document) => document.tagUuids.length,
  );
  const counts = new Map<string, number>();
  const withTag = new Map<string, number>();
  for (const document of tagged) {
    const carries = document.tagUuids.includes(tagUuid);
    for (const other of document.tagUuids) {
      counts.set(other, (counts.get(other) ?? 0) + 1);
      if (carries && other !== tagUuid)
        withTag.set(other, (withTag.get(other) ?? 0) + 1);
    }
  }
  const base = carriers.length / Math.max(1, tagged.length);

  const { minSimilarity, confidentSimilarity } = TAG_RECOMMENDATION;
  return corpus.documents
    .filter((document) => !document.tagUuids.includes(tagUuid))
    .map((document) => {
      const similarity = direction
        ? cosineSimilarity(document.vector, direction)
        : 0;
      // Only the carriers it is actually like are named for it, and with
      // none of them there is nothing to name.
      const alike =
        similarity > minSimilarity
          ? carriers
              .map((carrier) => ({
                carrier,
                similarity: cosineSimilarity(document.vector, carrier.vector),
              }))
              .filter((item) => item.similarity >= minSimilarity)
              .sort((left, right) => right.similarity - left.similarity)
          : [];
      const similar = alike.length
        ? {
            score: Math.min(
              1,
              (similarity - minSimilarity) /
                (confidentSimilarity - minSimilarity),
            ),
            entities: alike
              .slice(0, TAG_RECOMMENDATION.reasonEntities)
              .map(({ carrier }) => entityOf(carrier)),
          }
        : undefined;
      const relatedCarriers = (corpus.relations.get(document.key) ?? [])
        .map((key) => corpus.byKey.get(key))
        .filter(
          (related): related is TagEvidenceDocument =>
            related?.tagUuids.includes(tagUuid) ?? false,
        );
      const together = document.tagUuids.flatMap((other) => {
        const both = withTag.get(other) ?? 0;
        const share = both / (counts.get(other) ?? both);
        return both >= TAG_RECOMMENDATION.minTogether &&
          share >= TAG_RECOMMENDATION.minLift * base
          ? [{ other, share }]
          : [];
      });
      return {
        document,
        ...combineTagEvidence(
          {
            text: tagTextSignal(profile, { terms: document.terms }, corpus.idf),
            similar,
            related: relatedCarriers.length
              ? {
                  score: 1,
                  entities: relatedCarriers
                    .slice(0, TAG_RECOMMENDATION.reasonEntities)
                    .map(entityOf),
                }
              : undefined,
            together: together.length
              ? {
                  score: Math.max(...together.map(({ share }) => share)),
                  tagUuids: together.map(({ other }) => other),
                }
              : undefined,
          },
          tagTitle,
        ),
      };
    })
    .filter(({ score }) => score >= TAG_RECOMMENDATION.minScore)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.title.localeCompare(right.document.title, undefined, {
          sensitivity: 'base',
        }),
    )
    .slice(0, TAG_CANDIDATE_LIMIT)
    .map(({ document, score, reasons }) => ({
      ...entityOf(document),
      score,
      reasons,
    }));
}

/**
 * What the entities carrying a tag have in common that the rest of the archive
 * does not: the mean of their vectors less the mean of everyone else's, with
 * what is left positive kept and scaled to unit length. Words every entry
 * shares — a template, a signature — cancel out instead of making everything
 * look like everything (Rocchio's classifier).
 */
function tagDirection(
  carriers: TagEvidenceDocument[],
  others: TagEvidenceDocument[],
): TermVector {
  const direction: TermVector = new Map();
  for (const { vector } of carriers)
    for (const [term, weight] of vector)
      direction.set(
        term,
        (direction.get(term) ?? 0) + weight / carriers.length,
      );
  for (const { vector } of others)
    for (const [term, weight] of vector)
      if (direction.has(term))
        direction.set(term, direction.get(term)! - weight / others.length);
  let length = 0;
  for (const [term, weight] of direction) {
    if (weight <= 0) direction.delete(term);
    else length += weight * weight;
  }
  length = Math.sqrt(length);
  if (length > 0)
    for (const [term, weight] of direction)
      direction.set(term, weight / length);
  return direction;
}
