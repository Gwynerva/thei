import { eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  coverDatedPeriods,
  isApproximateDate,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import { diaryContentExcerpt } from '#layers/thei/shared/diary-text';
import {
  formatAbsolutePublicDate,
  formatCompactPublicPeriod,
  publicCalendarDay,
} from '#layers/thei/shared/public-date-format';
import type { PublicRelatedCounts } from '#layers/thei/shared/api/public';
import { tagAccent } from '#layers/thei/shared/tag';
import { STRANGER } from '../../access-links/viewer';
import { getEventPeriods } from '../../events/periods';
import { ownerText } from '../../owner-text';
import { getProjectSections } from '../../projects/content-sections';
import { isDatedSection } from '#layers/thei/shared/project-content-item';
import {
  buildPublicEntityChronology,
  buildPublicEntityReference,
  buildPublicPageListItem,
  buildPublicProjectHead,
  buildPublicTags,
  canOpenPublicEntity,
} from '../../public/entities';
import {
  buildPublicRelatedLinks,
  countPublicRelated,
  resolvePublicRelated,
  type PublicRelatedItem,
} from '../../public/related';
import { countPublicTagItems } from '../../public/tags';
import { listTagsForContainer } from '../../tags';
import { OG_KIND_ICONS, OG_META_ICONS } from '../icons';
import {
  emptyOgContent,
  type OgCardContent,
  type OgMeta,
  type OgPicture,
  type OgSite,
} from '../model';
import { ogAccent, ogBodyPicture, ogCount, ogPictureOfMedia } from './shared';

/**
 * The cards of single entities, each read as a stranger would see it: the
 * same builders the entity's public page uses, with the stranger's viewer,
 * so a card never shows or counts anything its page would not.
 */
const TAG_LIMIT = 8;
const RELATED_LIMIT = 3;

function phrase() {
  return THEI_SERVER.phrase;
}

function locale() {
  return THEI_SERVER.language.code;
}

/** The accent a picture carries, else one from the identity. */
function accentOf(picture: OgPicture | undefined, seed: string) {
  if (picture?.type === 'generated') return { hue: picture.hue, chroma: 0.15 };
  return ogAccent(picture?.accent, seed);
}

/**
 * Counts of what an entity is related to, as the tabs of its page label
 * them, most telling first.
 */
function relatedMeta(
  counts: PublicRelatedCounts,
  kinds: ('project' | 'event' | 'diary-entry')[],
): OgMeta[] {
  const words = {
    project: [OG_META_ICONS.projects, phrase().x_projects],
    event: [OG_META_ICONS.events, phrase().x_events],
    'diary-entry': [OG_META_ICONS.diary, phrase().x_diary_entries],
  } as const;
  return kinds
    .filter((kind) => counts[kind])
    .map((kind) => {
      const [icon, text] = words[kind];
      return { icon, text: ogCount(text(counts[kind]!), counts[kind]!) };
    });
}

/** The projects something belongs to, as its card names them. */
async function relatedProjects(items: PublicRelatedItem[]) {
  const projects = items.filter((item) => item.endpoint.type === 'project');
  if (!projects.length) return undefined;
  const links = await buildPublicRelatedLinks(
    projects.slice(0, RELATED_LIMIT),
    STRANGER,
  );
  return {
    icon: OG_KIND_ICONS.project,
    titles: links.map((link) => ownerText(link.title)),
    total: projects.length,
  };
}

/** When a set of periods happened, as a line of facts. */
function dated(periods: DatedPeriod[]): OgMeta {
  const cover = coverDatedPeriods(periods);
  return {
    icon: isApproximateDate(cover.precision)
      ? OG_META_ICONS.approximate
      : OG_META_ICONS.period,
    text: formatCompactPublicPeriod(cover, locale()),
  };
}

export async function projectContent(
  publicId: string,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  const project = await THEI_SERVER.projects.findByPublicId(publicId);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  const head = await buildPublicProjectHead(project, STRANGER);

  // The card is the project's page header: its icon — uploaded, or the one
  // the site draws — beside the title, and its banner behind, a video one
  // by the still its page shows before it plays.
  const [picture, banner] = await Promise.all([
    ogPictureOfMedia(head.iconMedia),
    ogPictureOfMedia(head.bannerMedia),
  ]);

  const meta: OgMeta[] = [];
  const sectionCount = ogCount(
    phrase().x_sections(head.sections.length),
    head.sections.length,
  );
  const sectionPeriods = head.sections.flatMap((section) => section.periods);
  // The stretch the dated sections cover is the project's own span; the count
  // beside it is of every section a stranger may open.
  if (sectionPeriods.length)
    meta.push({
      icon: OG_META_ICONS.period,
      text: `${formatCompactPublicPeriod(coverDatedPeriods(sectionPeriods), locale())} · ${sectionCount}`,
    });
  else if (head.sections.length)
    meta.push({ icon: OG_META_ICONS.sections, text: sectionCount });
  meta.push(
    ...relatedMeta(countPublicRelated(head.relations), [
      'event',
      'diary-entry',
      'project',
    ]),
  );

  const status = head.status.current;
  // Coloured as the header is: by its banner when it has one.
  const content = emptyOgContent(
    'project',
    project.projectUuid,
    ownerText(project.title),
    site,
    accentOf(banner ?? picture, project.projectUuid),
  );
  return {
    ...content,
    chips: [
      { icon: OG_KIND_ICONS.project, label: phrase().project },
      ...(project.showcase
        ? [
            {
              icon: OG_META_ICONS.showcase,
              label: phrase().project_showcase_badge,
            },
          ]
        : []),
      ...(project.cv
        ? [{ icon: OG_META_ICONS.cv, label: phrase().cv_project_label }]
        : []),
    ],
    summary: ownerText(project.summary),
    ...(status?.kind === 'regular' && status.text
      ? { status: ownerText(status.text) }
      : {}),
    meta,
    tags: head.tags.slice(0, TAG_LIMIT).map((tag) => ownerText(tag.title)),
    tagsTotal: head.tags.length,
    ...(picture ? { picture } : {}),
    ...(banner ? { banner } : {}),
  };
}

export async function sectionContent(
  publicId: string,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({
      uuid: schema.projectContentSections.sectionUuid,
      projectUuid: schema.projectContentSections.projectUuid,
      isPrivate: schema.projectContentSections.isPrivate,
    })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.publicId, publicId))
    .get();
  if (!row || row.isPrivate) return undefined;
  const project = await THEI_SERVER.projects.findByUuid(row.projectUuid);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  const sections = (await getProjectSections(project.projectUuid)).filter(
    (section) => !section.isPrivate,
  );
  const section = sections.find((item) => item.sectionUuid === row.uuid);
  if (!section) return undefined;
  const reference = await buildPublicEntityReference(project);
  const parent = {
    title: ownerText(project.title),
    picture: await ogPictureOfMedia(reference.iconMedia),
  };
  const picture = await ogBodyPicture(
    'project-section',
    section.sectionUuid,
    'project-section-body',
  );
  const content = {
    ...emptyOgContent(
      'section',
      section.sectionUuid,
      ownerText(section.title),
      site,
      accentOf(picture, section.sectionUuid),
    ),
    parent,
    summary: ownerText(section.summary),
    ...(picture ? { picture } : {}),
  };

  if (isDatedSection(section)) {
    // Its place among the stages — the dated sections a stranger sees —
    // oldest first: "Stage 3 of 7". It is still a section; the number says
    // which stage of the project's way it was.
    const datedSections = sections.filter(isDatedSection);
    return {
      ...content,
      chips: [
        {
          icon: OG_KIND_ICONS.section,
          label: phrase().og_section_position(
            datedSections.indexOf(section) + 1,
            datedSections.length,
          ),
        },
      ],
      meta: [dated(section.periods)],
    };
  }

  const chronology = buildPublicEntityChronology(section);
  return {
    ...content,
    chips: [{ icon: OG_KIND_ICONS.section, label: phrase().content_section }],
    meta: [
      {
        icon: OG_META_ICONS.updated,
        text: phrase().og_updated(
          formatAbsolutePublicDate(
            chronology.updatedAt ?? chronology.createdAt,
            locale(),
          ),
        ),
      },
    ],
  };
}

export async function eventContent(
  publicId: string,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  const stored = await THEI_SERVER.events.findByPublicId(publicId);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  const [periods, picture, tags, relations] = await Promise.all([
    getEventPeriods(stored.eventUuid),
    ogBodyPicture('event', stored.eventUuid, 'event-body'),
    listTagsForContainer('event', stored.eventUuid).then(buildPublicTags),
    resolvePublicRelated({ type: 'event', id: stored.eventUuid }, STRANGER),
  ]);
  return {
    ...emptyOgContent(
      'event',
      stored.eventUuid,
      ownerText(stored.title),
      site,
      accentOf(picture, stored.eventUuid),
    ),
    chips: [{ icon: OG_KIND_ICONS.event, label: phrase().event }],
    summary: ownerText(stored.summary),
    meta: [
      ...(periods.length ? [dated(periods)] : []),
      ...relatedMeta(countPublicRelated(relations), ['diary-entry']),
    ],
    related: await relatedProjects(relations),
    tags: tags.slice(0, TAG_LIMIT).map((tag) => ownerText(tag.title)),
    tagsTotal: tags.length,
    ...(picture ? { picture } : {}),
  };
}

/**
 * A diary entry's card. The day is its name — there is nothing else to call
 * it by — and its opening words, from the public part of its text only, are
 * what the card quotes. The day also seeds the card, as it seeds the entry's
 * card in the feeds: the calendar leaf takes the same cloud.
 */
export async function diaryContent(
  date: string,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  const stored = await THEI_SERVER.diary.findByDate(date);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  const [picture, body, relations] = await Promise.all([
    ogBodyPicture('diary-entry', stored.diaryUuid, 'diary-body'),
    THEI_SERVER.content.findByOwner(
      'diary-entry',
      stored.diaryUuid,
      'diary-body',
    ),
    resolvePublicRelated(
      { type: 'diary-entry', id: stored.diaryUuid },
      STRANGER,
    ),
  ]);
  const quote = diaryContentExcerpt(
    body?.data,
    false,
    phrase().content_private_section,
  );
  return {
    ...emptyOgContent(
      'diary',
      stored.date,
      formatAbsolutePublicDate(stored.date, locale()),
      site,
      accentOf(picture, stored.diaryUuid),
    ),
    chips: [{ icon: OG_KIND_ICONS.diary, label: phrase().diary_entry }],
    ...(quote ? { quote: ownerText(quote) } : {}),
    meta: relatedMeta(countPublicRelated(relations), ['event']),
    related: await relatedProjects(relations),
    date: publicCalendarDay(stored.date, locale()),
    ...(picture ? { picture } : {}),
  };
}

export async function pageContent(
  slug: string,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  const page = await THEI_SERVER.pages.findBySlug(slug);
  if (!page || page.access === ProjectEventAccessLevel.Private)
    return undefined;
  const item = await buildPublicPageListItem(page);
  const picture = await ogPictureOfMedia(item.iconMedia);
  return {
    ...emptyOgContent(
      'page',
      page.pageUuid,
      ownerText(page.title),
      site,
      accentOf(picture, page.pageUuid),
    ),
    chips: [{ icon: OG_KIND_ICONS.page, label: phrase().page }],
    summary: ownerText(page.summary),
    meta: [
      {
        icon: OG_META_ICONS.updated,
        text: phrase().og_updated(
          formatAbsolutePublicDate(item.updatedAt, locale()),
        ),
      },
    ],
    ...(picture ? { picture } : {}),
  };
}

/**
 * A tag's card: its icon, what it is and how much it holds. A tag nothing
 * public carries has no card, just as its page is not found.
 */
export async function tagContent(
  publicId: string,
  site: OgSite,
): Promise<OgCardContent | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  const tag = db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.publicId, publicId))
    .get();
  if (!tag) return undefined;
  const { projectCount, eventCount } = countPublicTagItems(tag.tagUuid, false);
  if (!projectCount && !eventCount) return undefined;
  const [summary] = await buildPublicTags([
    {
      tagUuid: tag.tagUuid,
      title: tag.title,
      slug: tag.slug,
      publicId: tag.publicId,
      description: tag.description || undefined,
    },
  ]);
  const accent = tagAccent({ title: tag.title, iconMedia: summary?.iconMedia });
  // A tag without an icon of its own is drawn one in its colour, as the site
  // draws one for any other thing without a picture.
  const picture: OgPicture = (await ogPictureOfMedia(summary?.iconMedia)) ?? {
    type: 'generated',
    kind: 'tag',
    hue: accent.hue,
  };
  return {
    ...emptyOgContent('tag', tag.tagUuid, ownerText(tag.title), site, accent),
    chips: [{ icon: OG_KIND_ICONS.tag, label: phrase().tag }],
    summary: ownerText(tag.description),
    meta: [
      ...(projectCount
        ? [
            {
              icon: OG_META_ICONS.projects,
              text: ogCount(phrase().x_projects(projectCount), projectCount),
            },
          ]
        : []),
      ...(eventCount
        ? [
            {
              icon: OG_META_ICONS.events,
              text: ogCount(phrase().x_events(eventCount), eventCount),
            },
          ]
        : []),
    ],
    picture,
  };
}
