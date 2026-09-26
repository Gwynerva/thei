import { and, asc, inArray } from 'drizzle-orm';
import { contentPlainText } from '#layers/thei/shared/content';
import { TAG_CONTAINER_TYPES } from '#layers/thei/shared/tag';
import {
  buildTagProfile,
  joinTagContextText,
  recommendTags,
  tagEntityKey,
  type TagEvidenceDocument,
  type TagProfile,
  type TagRecommendation,
  type TagRecommendationRequest,
} from '#layers/thei/shared/tag-recommendation';
import {
  inverseDocumentFrequency,
  normalizeTermText,
  readTerms,
  termVector,
  type TermCounts,
} from '#layers/thei/shared/text-terms';
import { buildTagItems } from './tags';

/**
 * What tag recommendations know about the archive: every project and event as
 * a bag of words with its tags, and every tag as the words it is found by.
 *
 * Like the public search index, it lives in memory, is built on the first
 * request, dropped by any write (see `server/thei/plugin.ts`) and rebuilt
 * after a while regardless. Reading words out of texts is the costly part, so
 * the words of each entity are kept across rebuilds until its text changes:
 * after one save, only the saved entity is read again.
 */

const INDEX_TTL_MS = 10 * 60_000;

export type TagRecommendationIndex = {
  builtAt: number;
  documents: TagEvidenceDocument[];
  byKey: Map<string, TagEvidenceDocument>;
  profiles: TagProfile[];
  tagRows: Map<string, TagRow>;
  idf: (term: string) => number;
  /** Projects and events related to each project or event. */
  relations: Map<string, string[]>;
};

type TagRow = typeof import('./db/schema/tags').tags.$inferSelect;

let cachedIndex: TagRecommendationIndex | undefined;
const termsByDocument = new Map<string, { hash: string; counts: TermCounts }>();

export function invalidateTagRecommendationIndex() {
  cachedIndex = undefined;
}

export function getTagRecommendationIndex(): TagRecommendationIndex {
  if (!cachedIndex || Date.now() - cachedIndex.builtAt > INDEX_TTL_MS)
    cachedIndex = buildTagRecommendationIndex();
  return cachedIndex;
}

const BODY_SLOTS = [
  'project-description',
  'event-body',
  'project-stage-body',
  'project-section-body',
] as const;

export function buildTagRecommendationIndex(): TagRecommendationIndex {
  const { db, schema } = THEI_SERVER.useDb();
  const projects = db
    .select({
      id: schema.projects.projectUuid,
      title: schema.projects.title,
      summary: schema.projects.summary,
    })
    .from(schema.projects)
    .all();
  const events = db
    .select({
      id: schema.events.eventUuid,
      title: schema.events.title,
      summary: schema.events.summary,
    })
    .from(schema.events)
    .all();
  const parts = [
    ...db
      .select({
        id: schema.projectStages.stageUuid,
        projectUuid: schema.projectStages.projectUuid,
        title: schema.projectStages.title,
        summary: schema.projectStages.summary,
      })
      .from(schema.projectStages)
      .all(),
    ...db
      .select({
        id: schema.projectContentSections.sectionUuid,
        projectUuid: schema.projectContentSections.projectUuid,
        title: schema.projectContentSections.title,
        summary: schema.projectContentSections.summary,
      })
      .from(schema.projectContentSections)
      .orderBy(asc(schema.projectContentSections.sortOrder))
      .all(),
  ];
  const bodies = new Map(
    db
      .select({
        ownerId: schema.content.ownerId,
        data: schema.content.data,
      })
      .from(schema.content)
      .where(inArray(schema.content.slot, [...BODY_SLOTS]))
      .all()
      .map((row) => [row.ownerId, contentPlainText(row.data)]),
  );
  const partsByProject = new Map<string, string[]>();
  for (const part of parts) {
    partsByProject.set(part.projectUuid, [
      ...(partsByProject.get(part.projectUuid) ?? []),
      part.title,
      part.summary,
      bodies.get(part.id) ?? '',
    ]);
  }
  const tagUuidsByKey = new Map<string, string[]>();
  for (const usage of db
    .select()
    .from(schema.tagUsages)
    .orderBy(asc(schema.tagUsages.sortOrder))
    .all()) {
    const key = tagEntityKey({
      type: usage.containerType,
      id: usage.containerId,
    });
    tagUuidsByKey.set(key, [...(tagUuidsByKey.get(key) ?? []), usage.tagUuid]);
  }

  const sources = [
    ...projects.map((row) => ({
      type: 'project' as const,
      ...row,
      text: joinTagContextText([
        row.summary,
        bodies.get(row.id),
        ...(partsByProject.get(row.id) ?? []),
      ]),
    })),
    ...events.map((row) => ({
      type: 'event' as const,
      ...row,
      text: joinTagContextText([row.summary, bodies.get(row.id)]),
    })),
  ];
  const liveKeys = new Set<string>();
  const counted = sources.map((source) => {
    const key = tagEntityKey(source);
    liveKeys.add(key);
    return {
      type: source.type,
      id: source.id,
      title: source.title,
      key,
      tagUuids: tagUuidsByKey.get(key) ?? [],
      terms: documentTerms(key, source.title, source.text),
    };
  });
  for (const key of termsByDocument.keys())
    if (!liveKeys.has(key)) termsByDocument.delete(key);

  const frequencies = new Map<string, number>();
  for (const { terms } of counted)
    for (const term of terms.keys())
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const idf = (term: string) =>
    inverseDocumentFrequency(counted.length, frequencies.get(term) ?? 0);

  const documents: TagEvidenceDocument[] = counted.map((document) => ({
    ...document,
    vector: termVector(document.terms, idf),
  }));
  const tagRows = new Map(
    db
      .select()
      .from(schema.tags)
      .all()
      .map((tag) => [tag.tagUuid, tag]),
  );

  const relations = new Map<string, string[]>();
  const link = (from: string, to: string) =>
    relations.set(from, [...(relations.get(from) ?? []), to]);
  for (const row of db
    .select({
      firstType: schema.entityRelations.firstType,
      firstId: schema.entityRelations.firstId,
      secondType: schema.entityRelations.secondType,
      secondId: schema.entityRelations.secondId,
    })
    .from(schema.entityRelations)
    .where(
      and(
        inArray(schema.entityRelations.firstType, [...TAG_CONTAINER_TYPES]),
        inArray(schema.entityRelations.secondType, [...TAG_CONTAINER_TYPES]),
      ),
    )
    .all()) {
    const first = tagEntityKey({ type: row.firstType, id: row.firstId });
    const second = tagEntityKey({ type: row.secondType, id: row.secondId });
    link(first, second);
    link(second, first);
  }

  return {
    builtAt: Date.now(),
    documents,
    byKey: new Map(documents.map((document) => [document.key, document])),
    profiles: [...tagRows.values()].map((tag) => buildTagProfile(tag, idf)),
    tagRows,
    idf,
    relations,
  };
}

/** The words of one entity, read again only when its text has changed. */
function documentTerms(key: string, title: string, text: string): TermCounts {
  const hash = textHash(`${title}\u0000${text}`);
  const known = termsByDocument.get(key);
  if (known?.hash === hash) return known.counts;
  const { counts } = readTerms({ title, text });
  termsByDocument.set(key, { hash, counts });
  return counts;
}

/** FNV-1a over the UTF-16 code units, with the length alongside. */
function textHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

/** Tags worth recommending for a project or an event being edited. */
export async function recommendTagsForDraft(
  request: TagRecommendationRequest,
): Promise<TagRecommendation[]> {
  const index = getTagRecommendationIndex();
  const ownerKey = request.owner && tagEntityKey(request.owner);
  const { counts, surfaces } = readTerms(request);
  const ranked = recommendTags(
    {
      ownerKey,
      terms: counts,
      surfaces,
      normalizedText: normalizeTermText(`${request.title}\n${request.text}`),
      vector: termVector(counts, index.idf),
      selectedTagUuids: new Set(request.selectedTagUuids),
      related: request.related.flatMap((endpoint) => {
        const document = index.byKey.get(tagEntityKey(endpoint));
        return document && document.key !== ownerKey ? [document] : [];
      }),
    },
    index,
  );
  const items = await buildTagItems(
    ranked.map(({ tagUuid }) => index.tagRows.get(tagUuid)!),
  );
  return items.map((item, position) => ({
    ...item,
    score: ranked[position]!.score,
    reasons: ranked[position]!.reasons,
  }));
}
