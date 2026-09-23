import {
  PUBLIC_SEARCH_PRESETS,
  publicSearchPresetHref,
} from '#layers/thei/shared/public-search';
import { resolveSiteUrl } from '#layers/thei/shared/site-url';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildLifeUrl } from '#layers/thei/shared/life';
import {
  LIFE_PRESETS,
  lifePresetHref,
  PROJECT_TIMELINE_PRESETS,
} from '#layers/thei/shared/life-presets';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildProjectChildUrl,
  buildProjectTimelineUrl,
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

export type SitemapDiaryEntry = AccessLike & {
  date: string;
  updatedAt: number;
};

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
  diaryEntries: readonly SitemapDiaryEntry[];
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
  const diaryEntries = input.diaryEntries.filter(isListable);
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
    // The readings of the chronology that are destinations of their own — the
    // diary, so far — each with their own title and description.
    ...LIFE_PRESETS.map((preset) => ({ path: lifePresetHref(preset) })),
    ...projects.flatMap((project) => {
      const timeline = buildProjectTimelineUrl(
        project.humanReadableSlug,
        project.publicId,
      );
      return [
        {
          path: buildProjectUrl(project.humanReadableSlug, project.publicId),
          lastmod: isoDate(project.updatedAt),
        },
        // Both tabs of the page, and the two filters of its chronology that
        // used to be lists of their own.
        { path: timeline },
        ...PROJECT_TIMELINE_PRESETS.filter((preset) => preset.listed).map(
          (preset) => ({
            path: buildLifeUrl({ filter: preset.filter }, timeline),
          }),
        ),
      ];
    }),
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
    ...diaryEntries.map((entry) => ({
      path: buildDiaryUrl(entry.date),
      lastmod: isoDate(entry.updatedAt),
    })),
    ...input.tags
      .filter((tag) => taggedIds.has(tag.tagUuid))
      .map((tag) => ({ path: buildTagUrl(tag.slug, tag.publicId) })),
  ];
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
