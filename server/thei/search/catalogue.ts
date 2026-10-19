import { and, eq, inArray } from 'drizzle-orm';
import { utcDayOf } from '#layers/thei/shared/date-range';
import { resolvePagination } from '#layers/thei/shared/pagination';
import type { PublicEntitySummary } from '#layers/thei/shared/api/public';
import type { PublicSearchFilters } from '#layers/thei/shared/public-search';
import {
  SEARCH_PAGE_SIZE,
  type SearchFacets,
  type SearchHit,
  type SearchResponse,
} from '#layers/thei/shared/search/api';
import { siteViewer } from '../access-links/viewer';
import { tagUuidsBySlug } from '../tags';
import {
  buildPublicEventSummary,
  buildPublicProjectSummary,
  buildPublicTagRows,
  canListPublicEntity,
  listablePublicEntityWhere,
} from '../public/entities';

/**
 * The search page with no query: the catalogue of projects and events, which
 * the presets name — the projects, the showcase, the résumé. It is read from
 * the site itself rather than the search index, so it stands whole from the
 * first request after an installation, and the presets' Open Graph cards
 * count what the page lists.
 */
interface CatalogueEntry {
  type: 'project' | 'event';
  uuid: string;
  showcase: boolean;
  cv: boolean;
  /** The latest end of a period, else the day it was made. */
  sortDate: string;
  createdAt: number;
  tagUuids: string[];
}

function latestDates(rows: { owner: string; date: string }[]) {
  const dates = new Map<string, string>();
  for (const { owner, date } of rows)
    if ((dates.get(owner) ?? '') < date) dates.set(owner, date);
  return dates;
}

/** Every project and event a reader may list, in the catalogue's order. */
export function catalogueEntries(isAdmin: boolean): CatalogueEntry[] {
  const { db, schema } = THEI_SERVER.useDb();
  const tagUuidsByOwner = new Map<string, string[]>();
  for (const usage of db
    .select()
    .from(schema.tagUsages)
    .where(inArray(schema.tagUsages.containerType, ['project', 'event']))
    .orderBy(schema.tagUsages.sortOrder)
    .all()) {
    const key = `${usage.containerType}:${usage.containerId}`;
    tagUuidsByOwner.set(key, [
      ...(tagUuidsByOwner.get(key) ?? []),
      usage.tagUuid,
    ]);
  }
  // Private sections stay out of the order, as they stay out of the page.
  const sectionDates = latestDates(
    db
      .select({
        owner: schema.projectContentSections.projectUuid,
        date: schema.periods.endDate,
      })
      .from(schema.periods)
      .innerJoin(
        schema.projectContentSections,
        eq(schema.projectContentSections.sectionUuid, schema.periods.ownerId),
      )
      .where(
        and(
          eq(schema.periods.ownerType, 'project-section'),
          eq(schema.projectContentSections.isPrivate, false),
        ),
      )
      .all(),
  );
  const eventDates = latestDates(
    db
      .select({ owner: schema.periods.ownerId, date: schema.periods.endDate })
      .from(schema.periods)
      .where(eq(schema.periods.ownerType, 'event'))
      .all(),
  );
  const entries: CatalogueEntry[] = [
    ...db
      .select()
      .from(schema.projects)
      .all()
      .filter((row) => canListPublicEntity(row.access, isAdmin))
      .map((row) => ({
        type: 'project' as const,
        uuid: row.projectUuid,
        showcase: row.showcase,
        cv: row.cv,
        sortDate: sectionDates.get(row.projectUuid) ?? utcDayOf(row.createdAt),
        createdAt: row.createdAt,
        tagUuids: tagUuidsByOwner.get(`project:${row.projectUuid}`) ?? [],
      })),
    ...db
      .select()
      .from(schema.events)
      .all()
      .filter((row) => canListPublicEntity(row.access, isAdmin))
      .map((row) => ({
        type: 'event' as const,
        uuid: row.eventUuid,
        showcase: false,
        cv: false,
        sortDate: eventDates.get(row.eventUuid) ?? utcDayOf(row.createdAt),
        createdAt: row.createdAt,
        tagUuids: tagUuidsByOwner.get(`event:${row.eventUuid}`) ?? [],
      })),
  ];
  return entries.sort(
    (left, right) =>
      Number(right.type === 'project' && right.showcase) -
        Number(left.type === 'project' && left.showcase) ||
      right.sortDate.localeCompare(left.sortDate) ||
      right.createdAt - left.createdAt ||
      left.uuid.localeCompare(right.uuid),
  );
}

/** The entries a set of filters keeps, and how often each tag is among them. */
export function filterCatalogue(
  entries: CatalogueEntry[],
  filters: PublicSearchFilters,
) {
  const included = tagUuidsBySlug(filters.tags);
  const excluded = tagUuidsBySlug(filters.exclude);
  const type =
    filters.type === 'project' || filters.type === 'event'
      ? filters.type
      : undefined;
  const projectsOnly = type !== 'event' && (filters.showcase || filters.cv);
  const kept = entries.filter((entry) => {
    if (type && entry.type !== type) return false;
    if (projectsOnly) {
      if (entry.type !== 'project') return false;
      if (filters.showcase && !entry.showcase) return false;
      if (filters.cv && !entry.cv) return false;
    }
    if (!included.every((uuid) => entry.tagUuids.includes(uuid))) return false;
    return !excluded.some((uuid) => entry.tagUuids.includes(uuid));
  });
  const tagCounts = new Map<string, number>();
  for (const entry of kept)
    for (const tagUuid of entry.tagUuids)
      tagCounts.set(tagUuid, (tagCounts.get(tagUuid) ?? 0) + 1);
  return { entries: kept, tagCounts, included, excluded };
}

function hitOfSummary(summary: PublicEntitySummary, ref: string): SearchHit {
  return {
    kind: summary.type,
    ref,
    title: summary.title,
    href: summary.href,
    ...(summary.date ? { date: summary.date } : {}),
    ...(summary.period
      ? {
          period: {
            startDate: summary.period.startDate,
            endDate: summary.period.endDate,
          },
        }
      : {}),
    ...(summary.summary ? { summary: summary.summary } : {}),
    ...(summary.media ? { media: summary.media } : {}),
    ...(summary.showcase ? { showcase: true } : {}),
    ...(summary.cv ? { cv: true } : {}),
    ...(summary.access === 'link-only' || summary.access === 'private'
      ? { access: summary.access }
      : {}),
    ...(summary.reminder ? { reminder: summary.reminder } : {}),
    finds: [],
    more: 0,
  };
}

/**
 * The tags most carried by what this reader may open, busiest first: words a
 * quick search with nothing typed offers to try.
 */
export function popularTagTitles(isAdmin: boolean, limit = 6): string[] {
  const { db, schema } = THEI_SERVER.useDb();
  const usages = schema.tagUsages;
  // What carries a tag, as this reader may list it.
  const carried = [
    ...db
      .select({ tagUuid: usages.tagUuid })
      .from(usages)
      .innerJoin(
        schema.projects,
        and(
          eq(usages.containerType, 'project'),
          eq(usages.containerId, schema.projects.projectUuid),
        ),
      )
      .where(listablePublicEntityWhere(schema.projects.access, isAdmin))
      .all(),
    ...db
      .select({ tagUuid: usages.tagUuid })
      .from(usages)
      .innerJoin(
        schema.events,
        and(
          eq(usages.containerType, 'event'),
          eq(usages.containerId, schema.events.eventUuid),
        ),
      )
      .where(listablePublicEntityWhere(schema.events.access, isAdmin))
      .all(),
  ];
  const counts = new Map<string, number>();
  for (const { tagUuid } of carried)
    counts.set(tagUuid, (counts.get(tagUuid) ?? 0) + 1);
  if (!counts.size) return [];
  return db
    .select({ tagUuid: schema.tags.tagUuid, title: schema.tags.title })
    .from(schema.tags)
    .where(inArray(schema.tags.tagUuid, [...counts.keys()]))
    .all()
    .sort(
      (left, right) =>
        counts.get(right.tagUuid)! - counts.get(left.tagUuid)! ||
        left.title.localeCompare(right.title),
    )
    .slice(0, limit)
    .map((tag) => tag.title);
}

/** A page of the catalogue, as the search page and its presets show it. */
export async function runCatalogue(
  filters: PublicSearchFilters,
  page: number,
  isAdmin: boolean,
): Promise<SearchResponse> {
  const all = catalogueEntries(isAdmin);
  const { entries, tagCounts, included, excluded } = filterCatalogue(
    all,
    filters,
  );
  const pagination = resolvePagination(entries.length, page, SEARCH_PAGE_SIZE);
  const slice = entries.slice(
    (pagination.page - 1) * SEARCH_PAGE_SIZE,
    pagination.page * SEARCH_PAGE_SIZE,
  );
  const { db, schema } = THEI_SERVER.useDb();
  const hits = (
    await Promise.all(
      slice.map(async (entry) => {
        if (entry.type === 'project') {
          const row = db
            .select()
            .from(schema.projects)
            .where(eq(schema.projects.projectUuid, entry.uuid))
            .get();
          return row
            ? hitOfSummary(
                await buildPublicProjectSummary(row, isAdmin),
                `project:${entry.uuid}`,
              )
            : undefined;
        }
        const row = db
          .select()
          .from(schema.events)
          .where(eq(schema.events.eventUuid, entry.uuid))
          .get();
        return row
          ? hitOfSummary(
              await buildPublicEventSummary(row, siteViewer(isAdmin)),
              `event:${entry.uuid}`,
            )
          : undefined;
      }),
    )
  ).filter((hit): hit is SearchHit => Boolean(hit));
  const kinds: SearchFacets['kinds'] = {};
  for (const entry of filterCatalogue(all, {
    ...filters,
    type: undefined,
    showcase: false,
    cv: false,
  }).entries)
    kinds[entry.type] = (kinds[entry.type] ?? 0) + 1;
  const facetUuids = [
    ...new Set([...tagCounts.keys(), ...included, ...excluded]),
  ];
  const tagRows = facetUuids.length
    ? db
        .select()
        .from(schema.tags)
        .where(inArray(schema.tags.tagUuid, facetUuids))
        .all()
    : [];
  const summaries = await buildPublicTagRows(tagRows);
  return {
    query: '',
    total: entries.length,
    groups: hits.length
      ? [
          {
            kind: filters.type === 'event' ? 'event' : 'project',
            total: entries.length,
            hits,
          },
        ]
      : [],
    facets: {
      kinds,
      years: [],
      tags: tagRows
        .map((tag, at) => ({
          tag: summaries[at]!,
          count: tagCounts.get(tag.tagUuid) ?? 0,
          ...(included.includes(tag.tagUuid)
            ? { state: 'include' as const }
            : excluded.includes(tag.tagUuid)
              ? { state: 'exclude' as const }
              : {}),
        }))
        .sort(
          (left, right) =>
            right.count - left.count ||
            left.tag.title.localeCompare(right.tag.title),
        ),
    },
    page: pagination.page,
    pageCount: pagination.pageCount,
  };
}
