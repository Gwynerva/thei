import { count, eq } from 'drizzle-orm';
import {
  PUBLIC_SEARCH_PRESETS,
  type PublicSearchPreset,
} from '#layers/thei/shared/public-search';
import { tagAccent } from '#layers/thei/shared/tag';
import {
  buildPublicEntityReference,
  buildPublicPageListItem,
  buildPublicTags,
  listPublicPages,
} from '../../public/entities';
import { countLifePointsByYear } from '../../public/life';
import {
  getPublicSearchIndex,
  searchPublicDocuments,
} from '../../public/search-index';
import { listPublicTagCountsByUse } from '../../public/tags';
import { getProfileIdentity } from '../../profile';
import { ownerText } from '../../owner-text';
import { OG_META_ICONS, OG_SERVICE_ICONS } from '../icons';
import {
  emptyOgContent,
  type OgCardContent,
  type OgMeta,
  type OgPicture,
  type OgServiceId,
  type OgSite,
  type OgTag,
} from '../model';
import {
  ogAccent,
  ogBodyPicture,
  ogCount,
  ogPictureOfMedia,
  ogStat,
} from './shared';

/**
 * The cards of the site itself and of the pages that are not one entity.
 */
const CLOUD_LIMIT = 24;
const TILE_LIMIT = 5;

function phrase() {
  return THEI_SERVER.phrase;
}

/**
 * What the archive holds, as the site counts it: every project, event and
 * diary entry, a secret one included. The home page reports the real totals
 * of projects and events and presents the secret ones under a codename; the
 * diary feed does the same with private entries, so every card that counts
 * entries — this one, the diary's own — agrees with it.
 */
function archiveTotals() {
  const { db, schema } = THEI_SERVER.useDb();
  const total = (table: any) =>
    db.select({ n: count() }).from(table).get()?.n ?? 0;
  return {
    projects: total(schema.projects),
    events: total(schema.events),
    diary: total(schema.diaryEntries),
  };
}

function totalsMeta(totals: ReturnType<typeof archiveTotals>): OgMeta[] {
  return (
    [
      [OG_META_ICONS.projects, phrase().x_projects, totals.projects],
      [OG_META_ICONS.events, phrase().x_events, totals.events],
      [OG_META_ICONS.diary, phrase().x_diary_entries, totals.diary],
    ] as const
  )
    .filter(([, , count]) => count)
    .map(([icon, text, count]) => ({
      icon,
      text: ogCount(text(count), count),
    }));
}

async function owner() {
  const identity = await getProfileIdentity();
  return {
    identity,
    accent: ogAccent(identity.avatarMedia.accent, identity.profile.displayName),
  };
}

export async function homeContent(site: OgSite): Promise<OgCardContent> {
  const { identity, accent } = await owner();
  const totals = archiveTotals();
  const picture = await ogPictureOfMedia(identity.avatarMedia);
  return {
    ...emptyOgContent('site', 'site', site.name, site, accent),
    chips: [
      { icon: OG_META_ICONS.person, label: phrase().og_personal_archive },
    ],
    summary: ownerText(identity.profile.slogan),
    stats: (
      [
        [OG_META_ICONS.projects, phrase().x_projects, totals.projects],
        [OG_META_ICONS.events, phrase().x_events, totals.events],
        [OG_META_ICONS.diary, phrase().x_diary_entries, totals.diary],
      ] as const
    )
      .filter(([, , count]) => count)
      .map(([icon, text, count]) => ogStat(icon, text(count), count)),
    ...(picture ? { picture } : {}),
  };
}

function yearsOf(values: { year: number; count: number }[]) {
  return {
    first: String(values[0]?.year ?? ''),
    last: String(values.at(-1)?.year ?? ''),
    span: values.length,
  };
}

async function lifeContent(
  id: 'life' | 'diary',
  site: OgSite,
): Promise<OgCardContent> {
  const { accent } = await owner();
  const years = countLifePointsByYear(
    id === 'diary' ? { filter: ['diary-entry'] } : {},
  );
  const { first, last, span } = yearsOf(years);
  const total = years.reduce((sum, { count }) => sum + count, 0);
  const histogram = years.length
    ? { values: years.map(({ count }) => count), first, last }
    : undefined;
  const period = first && first !== last ? `${first} — ${last}` : first;
  const base = emptyOgContent(
    `service:${id}`,
    `service:${id}:${site.name}`,
    id === 'diary'
      ? ogCount(phrase().x_diary_entries(total), total)
      : span
        ? phrase().og_life_headline(span)
        : phrase().life,
    site,
    accent,
  );
  return {
    ...base,
    chips: [
      {
        icon: OG_SERVICE_ICONS[id],
        label: id === 'diary' ? phrase().diary_seo_title : phrase().life,
      },
    ],
    summary:
      id === 'diary'
        ? phrase().diary_seo_description
        : phrase().public_life_description,
    meta: [
      ...(period && id === 'diary'
        ? [{ icon: OG_META_ICONS.period, text: period }]
        : []),
      ...(id === 'life' ? totalsMeta(archiveTotals()) : []),
    ],
    ...(histogram ? { histogram } : {}),
  };
}

/**
 * The rewind depends on the day it is opened, and a card is drawn once for
 * every day: it says what the page is, not what today holds.
 */
async function rewindContent(site: OgSite): Promise<OgCardContent> {
  const { accent } = await owner();
  const { first, last } = yearsOf(countLifePointsByYear({}));
  return {
    ...emptyOgContent(
      'service:rewind',
      `service:rewind:${site.name}`,
      phrase().life_rewind_seo_title,
      site,
      accent,
    ),
    chips: [{ icon: OG_SERVICE_ICONS.rewind, label: phrase().life }],
    summary: phrase().life_rewind_description,
    meta:
      first && last && first !== last
        ? [{ icon: OG_META_ICONS.period, text: `${first} — ${last}` }]
        : [],
  };
}

const PRESET_OF: Partial<Record<OgServiceId, PublicSearchPreset['id']>> = {
  search: 'all',
  projects: 'projects',
  events: 'events',
  showcase: 'showcase',
  cv: 'cv',
};

/**
 * A search preset's card: what it lists, how many, and the pictures of the
 * first few — the same documents, in the same order, the page opens on.
 */
async function presetContent(
  id: OgServiceId,
  site: OgSite,
): Promise<OgCardContent> {
  const preset = PUBLIC_SEARCH_PRESETS.find(
    (item) => item.id === PRESET_OF[id],
  )!;
  const { documents } = searchPublicDocuments(
    getPublicSearchIndex(),
    { q: '', tags: [], exclude: [], ...preset.filters },
    false,
  );
  const { db, schema } = THEI_SERVER.useDb();
  const tiles = (
    await Promise.all(
      documents.slice(0, TILE_LIMIT).map(async (document) => {
        if (document.type === 'project') {
          const project = db
            .select()
            .from(schema.projects)
            .where(eq(schema.projects.projectUuid, document.uuid))
            .get();
          return project
            ? ogPictureOfMedia(
                (await buildPublicEntityReference(project)).iconMedia,
              )
            : undefined;
        }
        return ogBodyPicture('event', document.uuid, 'event-body');
      }),
    )
  ).filter((tile): tile is OgPicture => Boolean(tile));
  const projects = documents.filter((item) => item.type === 'project').length;
  const events = documents.length - projects;
  const first = tiles[0];
  const words = {
    all: ['search_preset_all_title', 'search_preset_all_description'],
    projects: [
      'search_preset_projects_title',
      'search_preset_projects_description',
    ],
    events: ['search_preset_events_title', 'search_preset_events_description'],
    showcase: [
      'search_preset_showcase_title',
      'search_preset_showcase_description',
    ],
    cv: ['search_preset_cv_title', 'search_preset_cv_description'],
  } as const;
  const [title, description] = words[preset.id];
  return {
    ...emptyOgContent(
      `service:${id}`,
      `service:${id}:${site.name}`,
      phrase()[title],
      site,
      first?.type === 'generated'
        ? { hue: first.hue, chroma: 0.15 }
        : ogAccent(first?.accent, `service:${id}`),
    ),
    chips: [{ icon: OG_SERVICE_ICONS[id], label: phrase().search }],
    summary: phrase()[description],
    meta: [
      ...(projects
        ? [
            {
              icon: OG_META_ICONS.projects,
              text: ogCount(phrase().x_projects(projects), projects),
            },
          ]
        : []),
      ...(events
        ? [
            {
              icon: OG_META_ICONS.events,
              text: ogCount(phrase().x_events(events), events),
            },
          ]
        : []),
    ],
    tiles,
    tilesTotal: documents.length,
  };
}

/** The tags page as a cloud of the most used tags, each in its own colour. */
async function tagsContent(site: OgSite): Promise<OgCardContent> {
  const rows = listPublicTagCountsByUse(false);
  const top = rows.slice(0, CLOUD_LIMIT);
  const summaries = await buildPublicTags(
    top.map(({ tag }) => ({
      tagUuid: tag.tagUuid,
      title: tag.title,
      slug: tag.slug,
      publicId: tag.publicId,
      description: tag.description || undefined,
    })),
  );
  const cloud: OgTag[] = await Promise.all(
    summaries.map(async (summary, index) => {
      const picture = await ogPictureOfMedia(summary.iconMedia);
      return {
        title: ownerText(summary.title),
        accent: tagAccent(summary),
        ...(picture ? { picture } : {}),
        count: top[index]!.projectCount + top[index]!.eventCount,
      };
    }),
  );
  return {
    ...emptyOgContent(
      'service:tags',
      `service:tags:${site.name}`,
      rows.length ? phrase().og_tags_headline(rows.length) : phrase().tags,
      site,
      cloud[0]?.accent ?? ogAccent(undefined, 'service:tags'),
    ),
    chips: [{ icon: OG_SERVICE_ICONS.tags, label: phrase().tags }],
    summary: phrase().public_tags_description,
    cloud,
    cloudTotal: rows.length,
  };
}

/** The pages directory: how many, and the icons of the newest. */
async function pagesContent(site: OgSite): Promise<OgCardContent> {
  const pages = listPublicPages(false);
  const tiles = (
    await Promise.all(
      pages
        .slice(0, TILE_LIMIT)
        .map(async (page) =>
          ogPictureOfMedia((await buildPublicPageListItem(page)).iconMedia),
        ),
    )
  ).filter((tile): tile is OgPicture => Boolean(tile));
  const first = tiles[0];
  return {
    ...emptyOgContent(
      'service:pages',
      `service:pages:${site.name}`,
      pages.length ? phrase().og_pages_headline(pages.length) : phrase().pages,
      site,
      first?.type === 'generated'
        ? { hue: first.hue, chroma: 0.15 }
        : ogAccent(first?.accent, 'service:pages'),
    ),
    chips: [{ icon: OG_SERVICE_ICONS.pages, label: phrase().pages }],
    summary: phrase().public_pages_description,
    tiles,
    tilesTotal: pages.length,
  };
}

export async function serviceContent(
  id: OgServiceId,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  switch (id) {
    case 'life':
    case 'diary':
      return lifeContent(id, site);
    case 'rewind':
      return rewindContent(site);
    case 'tags':
      return tagsContent(site);
    case 'pages':
      return pagesContent(site);
    default:
      return PRESET_OF[id] ? presetContent(id, site) : undefined;
  }
}
