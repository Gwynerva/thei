import type { H3Event } from 'h3';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  isPublicSecret,
  type PublicEntityReference,
  type PublicProjectSection,
} from '#layers/thei/shared/api/public';
import { contentEntityReference } from '#layers/thei/shared/content-link';
import {
  RELATION_ENTITY_TYPES,
  type RelationEndpoint,
  type RelationEntityType,
} from '#layers/thei/shared/relation';
import { relationLabel } from '#layers/thei/shared/relation-display';
import {
  findContentEntity,
  type ContentEntityRecord,
} from '../content-entities';
import { canResolveContentEntityLink } from '../content-links/access';
import { contentToMarkdown } from '#layers/thei/shared/content-markdown';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import {
  buildPublicDiaryEntry,
  buildPublicEvent,
  buildPublicPage,
  buildPublicProject,
  buildPublicProjectSection,
  canOpenPublicEntity,
} from '../public/entities';
import { listPublicRelatedAll } from '../public/related';
import { getProjectSections } from '../projects/content-sections';
import { siteUrl } from '../site-url';
import { STRANGER } from '../access-links/viewer';
import { ownerText } from '../owner-text';
import type { Period } from '#layers/thei/shared/period';
import {
  isApproximateDate,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import { lifeArrivalCutoff } from '#layers/thei/shared/life';

/**
 * Public pages as Markdown.
 *
 * A page here is an application: a reader that only wants the words gets a
 * skeleton and a payload of script. These routes hand over the same content
 * the page shows — with the same things hidden — as text a person or a model
 * can read directly.
 *
 * Everything is built with the visibility of a stranger, whoever asks. The
 * Markdown of a page has no owner's view, so no session and no share link can
 * turn it into one.
 *
 * The owner's words get the typography the page gives them (`ownerText`).
 */
export interface MarkdownDocument {
  body: string;
  /** The page this is a copy of, so a crawler indexes that instead. */
  canonical: string;
}

export async function renderProjectMarkdown(
  event: H3Event,
  part: string,
): Promise<MarkdownDocument | undefined> {
  const project = await THEI_SERVER.projects.findByPublicId(part);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  const data = await buildPublicProject(project, STRANGER);
  const canonical = buildProjectUrl(
    project.humanReadableSlug,
    project.publicId,
  );
  const lines = [
    `# ${ownerText(data.title)}`,
    ownerText(data.summary),
    await body(event, data.description),
  ];

  lines.push(...sectionList(event, data.sections));
  lines.push(
    ...(await relatedEntities(event, {
      type: 'project',
      id: project.projectUuid,
    })),
  );
  lines.push(...tagList(event, data.tags));

  return { body: join(lines), canonical: siteUrl(event, canonical) };
}

export async function renderProjectSectionMarkdown(
  event: H3Event,
  projectPart: string,
  sectionPart: string,
): Promise<MarkdownDocument | undefined> {
  const project = await THEI_SERVER.projects.findByPublicId(projectPart);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  const section = (await getProjectSections(project.projectUuid)).find(
    (item) => item.publicId === sectionPart,
  );
  if (!section || section.isPrivate) return undefined;
  const data = await buildPublicProjectSection(project, section, STRANGER);
  const canonical = buildProjectSectionUrl(
    project.humanReadableSlug,
    project.publicId,
    section.humanReadableSlug,
    section.publicId,
  );
  const lines = [
    `# ${ownerText(data.title)}`,
    ownerText(data.summary),
    `${THEI_SERVER.phrase.project}: [${ownerText(project.title)}](${siteUrl(
      event,
      buildProjectUrl(project.humanReadableSlug, project.publicId),
    )})`,
    ...periodLines(data.periods),
    await body(event, data.content),
  ];
  return { body: join(lines), canonical: siteUrl(event, canonical) };
}

export async function renderEventMarkdown(
  event: H3Event,
  part: string,
): Promise<MarkdownDocument | undefined> {
  const stored = await THEI_SERVER.events.findByPublicId(part);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  const data = await buildPublicEvent(stored, STRANGER);
  const lines = [
    `# ${ownerText(data.title)}`,
    ownerText(data.summary),
    ...periodLines(data.periods),
    await body(event, data.content),
    ...(await relatedEntities(event, { type: 'event', id: stored.eventUuid })),
    ...tagList(event, data.tags),
  ];
  return {
    body: join(lines),
    canonical: siteUrl(
      event,
      buildEventUrl(stored.humanReadableSlug, stored.publicId),
    ),
  };
}

/**
 * When an event or a section happened, on one line: each period's dates, then
 * the owner's name for it and whether it is still running or yet to come.
 */
function periodLines(periods: Period[]): string[] {
  if (!periods.length) return [];
  const cutoff = lifeArrivalCutoff();
  return [
    periods
      .map((period) => {
        const notes = [
          ...(period.label ? [ownerText(period.label)] : []),
          ...(period.startDate > cutoff
            ? [THEI_SERVER.phrase.period_state_upcoming]
            : period.endDate > cutoff
              ? [THEI_SERVER.phrase.period_state_ongoing]
              : []),
        ];
        const dates = periodDates(period);
        return notes.length ? `${dates} (${notes.join(', ')})` : dates;
      })
      .join(', '),
  ];
}

/**
 * A period's dates as sure as the owner is of them: cut to the month or the
 * year they know, and marked `~` when they are a guess, so the copy never
 * reads more definite than the page.
 */
function periodDates(period: DatedPeriod): string {
  const length =
    period.precision === 'year' ? 4 : period.precision === 'month' ? 7 : 10;
  const start = period.startDate.slice(0, length);
  const end = period.endDate.slice(0, length);
  const doubt = isApproximateDate(period.precision) ? '~' : '';
  return `${doubt}${start === end ? start : `${start} — ${end}`}`;
}

export async function renderDiaryMarkdown(
  event: H3Event,
  date: string,
): Promise<MarkdownDocument | undefined> {
  const stored = await THEI_SERVER.diary.findByDate(date);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  const data = await buildPublicDiaryEntry(stored, STRANGER);
  // The day is the heading, because an entry has nothing else to be called.
  const lines = [
    `# ${data.date}`,
    await body(event, data.content),
    ...(await relatedEntities(event, {
      type: 'diary-entry',
      id: stored.diaryUuid,
    })),
  ];
  return {
    body: join(lines),
    canonical: siteUrl(event, buildDiaryUrl(stored.date)),
  };
}

export async function renderPageMarkdown(
  event: H3Event,
  slug: string,
): Promise<MarkdownDocument | undefined> {
  const page = await THEI_SERVER.pages.findBySlug(slug);
  if (!page || page.access === ProjectEventAccessLevel.Private)
    return undefined;
  const data = await buildPublicPage(page, STRANGER);
  const lines = [
    `# ${ownerText(data.title)}`,
    ownerText(data.summary),
    await body(event, data.content),
  ];
  return {
    body: join(lines),
    canonical: siteUrl(event, buildPageUrl(page.slug)),
  };
}

async function body(
  event: H3Event,
  content: Parameters<typeof contentToMarkdown>[0],
): Promise<string> {
  return contentToMarkdown(await withEntityAddresses(content), {
    absolute: (path) => siteUrl(event, path),
    privateSectionLabel: THEI_SERVER.phrase.secret_hint,
    format: ownerText,
  });
}

/** An entity anchor in the canonical form stored content writes it in. */
const ENTITY_ANCHOR =
  /<a data-content-link="entity" data-entity-type="([a-z-]+)" data-entity-id="([^"]*)"/g;

/**
 * Gives every link to an entity of this site the address it opens.
 *
 * Stored content names its targets by uuid, which is what keeps a link alive
 * through a change of domain — and says nothing to a reader of plain text. So
 * before the document becomes Markdown, each link a stranger may follow gets
 * its address, and a link block its title too; a link to what a stranger may
 * not open keeps its words and loses the link.
 */
async function withEntityAddresses(
  content: Parameters<typeof contentToMarkdown>[0],
): Promise<Parameters<typeof contentToMarkdown>[0]> {
  if (!content) return content;
  const cache = new Map<string, Promise<ContentEntityRecord | undefined>>();
  const target = (entityType: unknown, entityId: unknown) => {
    const reference = contentEntityReference(entityType, entityId);
    if (!reference) return Promise.resolve(undefined);
    const key = `${reference.entityType}:${reference.entityId}`;
    let found = cache.get(key);
    if (!found) {
      found = findContentEntity(reference, STRANGER).then((entity) =>
        entity && canResolveContentEntityLink(entity.access, false)
          ? entity
          : undefined,
      );
      cache.set(key, found);
    }
    return found;
  };
  const inline = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') {
      if (!value.includes('data-content-link="entity"')) return value;
      const hrefs = new Map<string, string>();
      for (const [, entityType, entityId] of value.matchAll(ENTITY_ANCHOR)) {
        const entity = await target(entityType, entityId);
        if (entity) hrefs.set(`${entityType}:${entityId}`, entity.href);
      }
      return value.replace(ENTITY_ANCHOR, (anchor, entityType, entityId) => {
        const href = hrefs.get(`${entityType}:${entityId}`);
        return href ? `<a href="${href}"${anchor.slice(2)}` : anchor;
      });
    }
    if (Array.isArray(value)) return Promise.all(value.map(inline));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, item]) => [
            key,
            await inline(item),
          ]),
        ),
      );
    return value;
  };
  return {
    ...content,
    blocks: await Promise.all(
      content.blocks.map(async (block) => {
        if (block.type !== 'entityLink')
          return { ...block, data: (await inline(block.data)) as never };
        const entity = await target(block.data.entityType, block.data.entityId);
        return entity
          ? {
              ...block,
              data: { ...block.data, url: entity.href, title: entity.title },
            }
          : block;
      }),
    ),
  };
}

/**
 * A project's sections as its page shows them: the general ones in the
 * owner's order, then the stages, newest first, each with its stretch.
 */
function sectionList(event: H3Event, sections: PublicProjectSection[]) {
  if (!sections.length) return [];
  const phrase = THEI_SERVER.phrase;
  const lines = [`## ${phrase.project_content_sections}`];
  const groups = [
    [phrase.project_sections_undated, sections.filter((item) => !item.period)],
    [phrase.project_sections_dated, sections.filter((item) => item.period)],
  ] as const;
  for (const [title, group] of groups) {
    if (!group.length) continue;
    lines.push(`### ${title}`);
    for (const section of group)
      lines.push(
        `- [${ownerText(section.title)}](${siteUrl(event, section.href)})` +
          (section.period ? ` (${periodDates(section.period)})` : '') +
          (section.summary ? ` — ${ownerText(section.summary)}` : ''),
      );
  }
  return lines;
}

/**
 * Relations as the page lists them: one list per kind of entity, in the
 * order of its tabs, the directed relations first. A directed one says its
 * word for the other end — "Influences", "Depends" — run into the owner's
 * reason; a plain one says no word, and each falls back on what the entity
 * says of itself. A diary entry is called by its day, since it has no title.
 * A codename is left out: a copy for machines lists only what it can link.
 */
async function relatedEntities(
  event: H3Event,
  owner: RelationEndpoint,
): Promise<string[]> {
  const links = (await listPublicRelatedAll(owner, STRANGER)).filter(
    (link): link is PublicEntityReference => !isPublicSecret(link),
  );
  if (!links.length) return [];
  const phrase = THEI_SERVER.phrase;
  const kindTitles: Record<RelationEntityType, string> = {
    project: phrase.projects,
    event: phrase.events,
    'diary-entry': phrase.diary,
  };
  const lines = [`## ${phrase.related_entities}`];
  for (const kind of RELATION_ENTITY_TYPES) {
    const group = links.filter((link) => link.entityType === kind);
    if (!group.length) continue;
    lines.push(`### ${kindTitles[kind]}`);
    for (const link of group) {
      const type = link.relationType ?? 'related';
      const text = link.note || link.summary;
      const said = [
        type === 'related' ? '' : relationLabel(phrase, type),
        text ? ownerText(text) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      lines.push(
        `- [${ownerText(link.title)}](${siteUrl(event, link.href)})` +
          (said ? ` — ${said}` : ''),
      );
    }
  }
  return lines;
}

function tagList(
  event: H3Event,
  tags: { title: string; slug: string; publicId: string }[] | undefined,
): string[] {
  if (!tags?.length) return [];
  return [
    `## ${THEI_SERVER.phrase.tags}`,
    tags
      .map(
        (tag) =>
          `[${ownerText(tag.title)}](${siteUrl(event, `/tags/${tag.slug}-${tag.publicId}/`)})`,
      )
      .join(', '),
  ];
}

function join(lines: (string | undefined)[]): string {
  return `${lines
    .map((line) => line?.trim())
    .filter(Boolean)
    .join('\n\n')}\n`;
}
