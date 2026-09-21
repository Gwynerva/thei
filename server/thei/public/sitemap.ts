import {
  PUBLIC_SEARCH_PRESETS,
  publicSearchPresetHref,
} from '#layers/thei/shared/public-search';
import { resolveSiteUrl } from '#layers/thei/shared/site-url';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildLifeUrl } from '#layers/thei/shared/life';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildProjectChildUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import { buildTagUrl } from '#layers/thei/shared/tag-url';

export type SitemapEntry = {
  path: string;
  /** ISO date, omitted when the record carries no useful timestamp. */
  lastmod?: string;
};

type AccessLike = { access: ProjectEventAccessLevel };

export type SitemapProject = AccessLike & {
  projectUuid: string;
  humanReadableSlug: string;
  publicId: string;
  createdAt: number;
  updatedAt: number;
};

export type SitemapProjectChild = {
  projectUuid: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
  updatedAt: number;
};

export type SitemapEvent = AccessLike & {
  eventUuid: string;
  humanReadableSlug: string;
  publicId: string;
  updatedAt: number;
};

export type SitemapPage = AccessLike & { slug: string; updatedAt: number };

export type SitemapTag = { tagUuid: string; slug: string; publicId: string };

export type SitemapTagUsage = {
  tagUuid: string;
  containerType: string;
  containerId: string;
};

export type SitemapPeriod = {
  stageType: string;
  stageUuid: string;
  startDate: string;
  endDate: string;
};

export type SitemapInput = {
  projects: readonly SitemapProject[];
  sections: readonly SitemapProjectChild[];
  stages: readonly SitemapProjectChild[];
  events: readonly SitemapEvent[];
  pages: readonly SitemapPage[];
  tags: readonly SitemapTag[];
  tagUsages: readonly SitemapTagUsage[];
  periods: readonly SitemapPeriod[];
};

/**
 * Whether an entity may be listed to someone who is not an admin.
 *
 * This is deliberately the listing predicate, not the opening one. A
 * `link-only` entity opens for anyone holding the link, which is why its own
 * handlers answer with `X-Robots-Tag: noindex` — putting it in a sitemap would
 * hand a crawler exactly what that header exists to withhold.
 */
function isListable(entity: AccessLike): boolean {
  return entity.access === ProjectEventAccessLevel.Public;
}

function isoDate(epochMs: number): string | undefined {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return undefined;
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function buildSitemapEntries(input: SitemapInput): SitemapEntry[] {
  const projects = input.projects.filter(isListable);
  const events = input.events.filter(isListable);
  const pages = input.pages.filter(isListable);
  const projectByUuid = new Map(
    projects.map((project) => [project.projectUuid, project]),
  );

  // A child is reachable only when its project is listable AND the child is
  // not private on its own: a public project may hold private stages.
  const child = (
    items: readonly SitemapProjectChild[],
    kind: 'sections' | 'stages',
  ): SitemapEntry[] =>
    items.flatMap((item) => {
      if (item.isPrivate) return [];
      const project = projectByUuid.get(item.projectUuid);
      if (!project) return [];
      return [
        {
          path: buildProjectChildUrl(
            project.humanReadableSlug,
            project.publicId,
            kind,
            item.humanReadableSlug,
            item.publicId,
          ),
          lastmod: isoDate(item.updatedAt),
        },
      ];
    });

  // A tag is visible through its entities, so one hanging only on entities
  // nobody may list is not a page worth pointing a crawler at.
  const listableIds = new Set([
    ...projects.map((project) => project.projectUuid),
    ...events.map((event) => event.eventUuid),
  ]);
  const taggedIds = new Set(
    input.tagUsages
      .filter(
        (usage) =>
          (usage.containerType === 'project' ||
            usage.containerType === 'event') &&
          listableIds.has(usage.containerId),
      )
      .map((usage) => usage.tagUuid),
  );

  return [
    { path: '/' },
    { path: '/life/' },
    { path: '/rewind/' },
    { path: '/pages/' },
    { path: '/tags/' },
    // The named search configurations are pages of the site: "Projects",
    // "Events", the showcase, the résumé. Their canonical address is the
    // configuration itself, which is what goes in here.
    ...PUBLIC_SEARCH_PRESETS.map((preset) => ({
      path: publicSearchPresetHref(preset),
    })),
    ...lifeYearEntries(input, projects, events),
    ...projects.map((project) => ({
      path: buildProjectUrl(project.humanReadableSlug, project.publicId),
      lastmod: isoDate(project.updatedAt),
    })),
    ...child(input.sections, 'sections'),
    ...child(input.stages, 'stages'),
    ...events.map((event) => ({
      path: buildEventUrl(event.humanReadableSlug, event.publicId),
      lastmod: isoDate(event.updatedAt),
    })),
    ...pages.map((page) => ({
      path: buildPageUrl(page.slug),
      lastmod: isoDate(page.updatedAt),
    })),
    ...input.tags
      .filter((tag) => taggedIds.has(tag.tagUuid))
      .map((tag) => ({ path: buildTagUrl(tag.slug, tag.publicId) })),
  ];
}

/**
 * Years that the Life feed has something to show.
 *
 * Derived from listable entities only. Taking every year in the database would
 * publish the fact that something exists in a year whose only records are
 * private — the absence of a year is itself information.
 */
function lifeYearEntries(
  input: SitemapInput,
  projects: readonly SitemapProject[],
  events: readonly SitemapEvent[],
): SitemapEntry[] {
  const years = new Set<number>();
  for (const project of projects) {
    const date = isoDate(project.createdAt);
    if (date) years.add(Number(date.slice(0, 4)));
  }
  const eventUuids = new Set(events.map((event) => event.eventUuid));
  for (const period of input.periods) {
    if (period.stageType !== 'event-stage') continue;
    if (!eventUuids.has(period.stageUuid)) continue;
    const from = Number(period.startDate.slice(0, 4));
    const to = Number(period.endDate.slice(0, 4));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    for (let year = from; year <= to; year += 1) years.add(year);
  }
  return [...years]
    .sort((left, right) => right - left)
    .map((year) => ({ path: buildLifeUrl(String(year)) }));
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]!);
}

export function sitemapEntryXml(entry: SitemapEntry, origin: string): string {
  const location = escapeXml(resolveSiteUrl(origin, entry.path));
  return entry.lastmod
    ? `<url><loc>${location}</loc><lastmod>${entry.lastmod}</lastmod></url>`
    : `<url><loc>${location}</loc></url>`;
}
