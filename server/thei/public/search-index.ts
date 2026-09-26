import { and, eq, inArray, or } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type {
  PublicSearchResponse,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import { publicContentPlainText } from '#layers/thei/shared/content';
import {
  normalizePublicSearchText,
  publicSearchTokens,
  type PublicSearchFilters,
} from '#layers/thei/shared/public-search';
import {
  buildPublicEventSummary,
  buildPublicProjectSummary,
  buildPublicTags,
  canListPublicEntity,
} from './entities';
import { paginate } from '#layers/thei/shared/pagination';

/**
 * In-memory search over projects and events.
 *
 * A personal site holds hundreds of entries, not millions: one pass over a
 * prepared list is cheaper than FTS tables that every write has to maintain.
 * The list is built on the first search, dropped whenever the admin changes
 * anything (see `server/thei/plugin.ts`), and rebuilt after a TTL as a safety
 * net for writes that bypass the API.
 */

export const PUBLIC_SEARCH_PAGE_SIZE = 20;
const INDEX_TTL_MS = 10 * 60_000;

export interface PublicSearchDocument {
  type: 'project' | 'event';
  uuid: string;
  access: ProjectEventAccessLevel;
  showcase: boolean;
  cv: boolean;
  /** Latest stage or period date, else the creation date (YYYY-MM-DD). */
  sortDate: string;
  createdAt: number;
  tagUuids: string[];
  /** Normalized title, summary, tag titles and description text. */
  text: string;
}

export interface PublicSearchTag {
  tagUuid: string;
  title: string;
  slug: string;
  publicId: string;
  description: string;
}

export interface PublicSearchIndex {
  builtAt: number;
  /** Showcase projects first, then everything newest first. */
  documents: PublicSearchDocument[];
  tags: Map<string, PublicSearchTag>;
  tagUuidsBySlug: Map<string, string>;
  tagSummaries?: Promise<Map<string, PublicTagSummary>>;
}

let cachedIndex: PublicSearchIndex | undefined;

export function invalidatePublicSearchIndex() {
  cachedIndex = undefined;
}

export function comparePublicSearchDocuments(
  left: PublicSearchDocument,
  right: PublicSearchDocument,
) {
  const leftShowcase = left.type === 'project' && left.showcase;
  const rightShowcase = right.type === 'project' && right.showcase;
  if (leftShowcase !== rightShowcase) return leftShowcase ? -1 : 1;
  return (
    right.sortDate.localeCompare(left.sortDate) ||
    right.createdAt - left.createdAt ||
    left.uuid.localeCompare(right.uuid)
  );
}

function isoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function latestDates(rows: { owner: string; date: string }[]) {
  const dates = new Map<string, string>();
  for (const { owner, date } of rows) {
    if ((dates.get(owner) ?? '') < date) dates.set(owner, date);
  }
  return dates;
}

export function buildPublicSearchIndex(): PublicSearchIndex {
  const { db, schema } = THEI_SERVER.useDb();
  const projects = db.select().from(schema.projects).all();
  const events = db.select().from(schema.events).all();
  const tags = db.select().from(schema.tags).all();
  const usages = db
    .select()
    .from(schema.tagUsages)
    .where(inArray(schema.tagUsages.containerType, ['project', 'event']))
    .all();
  const contents = db
    .select({
      ownerType: schema.content.ownerType,
      ownerId: schema.content.ownerId,
      data: schema.content.data,
    })
    .from(schema.content)
    .where(
      or(
        and(
          eq(schema.content.ownerType, 'project'),
          eq(schema.content.slot, 'project-description'),
        ),
        and(
          eq(schema.content.ownerType, 'event'),
          eq(schema.content.slot, 'event-body'),
        ),
      ),
    )
    .all();
  // Private stages stay out of the order, as they stay out of the page.
  const stageDates = latestDates(
    db
      .select({
        owner: schema.projectStages.projectUuid,
        date: schema.stagePeriods.endDate,
      })
      .from(schema.stagePeriods)
      .innerJoin(
        schema.projectStages,
        eq(schema.projectStages.stageUuid, schema.stagePeriods.stageUuid),
      )
      .where(
        and(
          eq(schema.stagePeriods.stageType, 'project-stage'),
          eq(schema.projectStages.isPrivate, false),
        ),
      )
      .all(),
  );
  const eventDates = latestDates(
    db
      .select({
        owner: schema.stagePeriods.stageUuid,
        date: schema.stagePeriods.endDate,
      })
      .from(schema.stagePeriods)
      .where(eq(schema.stagePeriods.stageType, 'event-stage'))
      .all(),
  );

  const tagsByUuid = new Map(
    tags.map((tag) => [
      tag.tagUuid,
      {
        tagUuid: tag.tagUuid,
        title: tag.title,
        slug: tag.slug,
        publicId: tag.publicId,
        description: tag.description,
      },
    ]),
  );
  const tagUuidsByContainer = new Map<string, string[]>();
  for (const usage of [...usages].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = `${usage.containerType}:${usage.containerId}`;
    tagUuidsByContainer.set(key, [
      ...(tagUuidsByContainer.get(key) ?? []),
      usage.tagUuid,
    ]);
  }
  const textByOwner = new Map(
    contents.map((row) => [
      `${row.ownerType}:${row.ownerId}`,
      publicContentPlainText(row.data),
    ]),
  );

  function toDocument(
    type: 'project' | 'event',
    row: (typeof projects)[number] | (typeof events)[number],
    uuid: string,
    sortDate: string | undefined,
  ): PublicSearchDocument {
    const key = `${type}:${uuid}`;
    const tagUuids = tagUuidsByContainer.get(key) ?? [];
    return {
      type,
      uuid,
      access: row.access,
      showcase: 'showcase' in row && row.showcase,
      cv: 'cv' in row && row.cv,
      sortDate: sortDate ?? isoDate(row.createdAt),
      createdAt: row.createdAt,
      tagUuids,
      text: normalizePublicSearchText(
        [
          row.title,
          row.summary,
          ...tagUuids.map((tagUuid) => tagsByUuid.get(tagUuid)?.title ?? ''),
          textByOwner.get(key) ?? '',
        ].join('\n'),
      ),
    };
  }

  return {
    builtAt: Date.now(),
    documents: [
      ...projects.map((project) =>
        toDocument(
          'project',
          project,
          project.projectUuid,
          stageDates.get(project.projectUuid),
        ),
      ),
      ...events.map((event) =>
        toDocument(
          'event',
          event,
          event.eventUuid,
          eventDates.get(event.eventUuid),
        ),
      ),
    ].sort(comparePublicSearchDocuments),
    tags: tagsByUuid,
    tagUuidsBySlug: new Map(tags.map((tag) => [tag.slug, tag.tagUuid])),
  };
}

export function getPublicSearchIndex(): PublicSearchIndex {
  if (!cachedIndex || Date.now() - cachedIndex.builtAt > INDEX_TTL_MS) {
    cachedIndex = buildPublicSearchIndex();
  }
  return cachedIndex;
}

/** Pure filtering: the matching documents and tag counts over them. */
export function searchPublicDocuments(
  index: Pick<PublicSearchIndex, 'documents' | 'tagUuidsBySlug'>,
  filters: PublicSearchFilters,
  isAdmin: boolean,
) {
  const tokens = publicSearchTokens(filters.q);
  const resolve = (slugs: string[]) =>
    slugs
      .map((slug) => index.tagUuidsBySlug.get(slug))
      .filter((uuid): uuid is string => Boolean(uuid));
  const included = resolve(filters.tags);
  const excluded = resolve(filters.exclude);
  const projectFilters =
    filters.type !== 'event' && (filters.showcase || filters.cv);

  const documents = index.documents.filter((document) => {
    if (!canListPublicEntity(document.access, isAdmin)) return false;
    if (filters.type && document.type !== filters.type) return false;
    if (projectFilters) {
      if (document.type !== 'project') return false;
      if (filters.showcase && !document.showcase) return false;
      if (filters.cv && !document.cv) return false;
    }
    if (!included.every((uuid) => document.tagUuids.includes(uuid)))
      return false;
    if (excluded.some((uuid) => document.tagUuids.includes(uuid))) return false;
    return tokens.every((token) => document.text.includes(token));
  });

  const tagCounts = new Map<string, number>();
  for (const document of documents) {
    for (const tagUuid of document.tagUuids) {
      tagCounts.set(tagUuid, (tagCounts.get(tagUuid) ?? 0) + 1);
    }
  }
  return { documents, tagCounts, included, excluded };
}

/** Tag chips with icons, built once per index. */
async function tagSummaries(index: PublicSearchIndex) {
  const rows = [...index.tags.values()];
  index.tagSummaries ??= buildPublicTags(
    rows.map((tag) => ({
      tagUuid: tag.tagUuid,
      title: tag.title,
      slug: tag.slug,
      publicId: tag.publicId,
      description: tag.description || undefined,
    })),
  ).then(
    (summaries) =>
      new Map(
        summaries.map((summary, position) => [
          rows[position]!.tagUuid,
          summary,
        ]),
      ),
    (error: unknown) => {
      index.tagSummaries = undefined;
      throw error;
    },
  );
  return await index.tagSummaries;
}

export async function runPublicSearch(
  filters: PublicSearchFilters,
  pageValue: unknown,
  isAdmin: boolean,
): Promise<PublicSearchResponse> {
  const index = getPublicSearchIndex();
  const { documents, tagCounts, included, excluded } = searchPublicDocuments(
    index,
    filters,
    isAdmin,
  );
  const paged = paginate(documents, pageValue, PUBLIC_SEARCH_PAGE_SIZE);
  const { db, schema } = THEI_SERVER.useDb();
  const [items, summaries] = await Promise.all([
    Promise.all(
      paged.items.map(async (document) => {
        if (document.type === 'project') {
          const project = db
            .select()
            .from(schema.projects)
            .where(eq(schema.projects.projectUuid, document.uuid))
            .get();
          return project
            ? await buildPublicProjectSummary(project, isAdmin)
            : undefined;
        }
        const event = db
          .select()
          .from(schema.events)
          .where(eq(schema.events.eventUuid, document.uuid))
          .get();
        return event
          ? await buildPublicEventSummary(event, isAdmin)
          : undefined;
      }),
    ),
    tagSummaries(index),
  ]);

  const facetUuids = new Set([...tagCounts.keys(), ...included, ...excluded]);
  const facets = [...facetUuids]
    .map((tagUuid) => ({
      tag: summaries.get(tagUuid)!,
      count: tagCounts.get(tagUuid) ?? 0,
      ...(included.includes(tagUuid)
        ? { state: 'include' as const }
        : excluded.includes(tagUuid)
          ? { state: 'exclude' as const }
          : {}),
    }))
    .filter((facet) => facet.tag)
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.tag.title.localeCompare(right.tag.title),
    );

  return {
    ...paged,
    items: items.filter((item) => item !== undefined),
    totals: {
      project: documents.filter((document) => document.type === 'project')
        .length,
      event: documents.filter((document) => document.type === 'event').length,
    },
    filters: {
      ...filters,
      tags: filters.tags.filter((slug) => index.tagUuidsBySlug.has(slug)),
      exclude: filters.exclude.filter((slug) => index.tagUuidsBySlug.has(slug)),
    },
    tags: facets,
  };
}
