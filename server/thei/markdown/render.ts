import type { H3Event } from 'h3';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  isPublicSecret,
  type PublicDiaryLink,
} from '#layers/thei/shared/api/public';
import { contentEntityReference } from '#layers/thei/shared/content-link';
import type { RelationType } from '#layers/thei/shared/relation';
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
  buildProjectChildUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import {
  buildPublicDiaryEntry,
  buildPublicEvent,
  buildPublicPage,
  buildPublicProject,
  buildPublicProjectSection,
  buildPublicProjectStage,
  canOpenPublicEntity,
} from '../public/entities';
import { getProjectStages } from '../projects/stages';
import { getProjectContentSections } from '../projects/content-sections';
import { siteUrl } from '../site-url';

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
  const data = await buildPublicProject(project, false);
  const canonical = buildProjectUrl(
    project.humanReadableSlug,
    project.publicId,
  );
  const lines = [
    `# ${data.title}`,
    data.summary,
    await body(event, data.description),
  ];

  if (data.stages.length) {
    lines.push(`## ${THEI_SERVER.phrase.project_stages}`);
    for (const stage of data.stages)
      lines.push(
        `- [${stage.title}](${siteUrl(event, stage.href)})` +
          (stage.summary ? ` — ${stage.summary}` : ''),
      );
  }
  if (data.sections.length) {
    lines.push(`## ${THEI_SERVER.phrase.project_content_sections}`);
    for (const section of data.sections)
      lines.push(
        `- [${section.title}](${siteUrl(event, section.href)})` +
          (section.summary ? ` — ${section.summary}` : ''),
      );
  }
  // Related events are relations like any other and are listed with them.
  lines.push(...relatedEntities(event, data.relatedEntities));
  lines.push(...diaryList(event, data.diaryEntries));
  lines.push(...tagList(event, data.tags));

  return { body: join(lines), canonical: siteUrl(event, canonical) };
}

export async function renderProjectChildMarkdown(
  event: H3Event,
  kind: 'stages' | 'sections',
  projectPart: string,
  childPart: string,
): Promise<MarkdownDocument | undefined> {
  const project = await THEI_SERVER.projects.findByPublicId(projectPart);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  const children =
    kind === 'stages'
      ? await getProjectStages(project.projectUuid)
      : await getProjectContentSections(project.projectUuid);
  const child = children.find((item) => item.publicId === childPart);
  if (!child || child.isPrivate) return undefined;
  const data =
    kind === 'stages'
      ? await buildPublicProjectStage(project, child as never, false)
      : await buildPublicProjectSection(project, child as never, false);
  const canonical = buildProjectChildUrl(
    project.humanReadableSlug,
    project.publicId,
    kind === 'stages' ? 'stages' : 'sections',
    child.humanReadableSlug,
    child.publicId,
  );
  const lines = [
    `# ${data.title}`,
    data.summary,
    `${THEI_SERVER.phrase.project}: [${project.title}](${siteUrl(
      event,
      buildProjectUrl(project.humanReadableSlug, project.publicId),
    )})`,
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
  const data = await buildPublicEvent(stored, false);
  const lines = [
    `# ${data.title}`,
    data.summary,
    ...(data.periods.length
      ? [
          data.periods
            .map((period) =>
              period.endDate && period.endDate !== period.startDate
                ? `${period.startDate} — ${period.endDate}`
                : period.startDate,
            )
            .join(', '),
        ]
      : []),
    await body(event, data.content),
    ...relatedEntities(event, data.relatedEntities),
    ...diaryList(event, data.diaryEntries),
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

export async function renderDiaryMarkdown(
  event: H3Event,
  date: string,
): Promise<MarkdownDocument | undefined> {
  const stored = await THEI_SERVER.diary.findByDate(date);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  const data = await buildPublicDiaryEntry(stored, false);
  // The day is the heading, because an entry has nothing else to be called.
  const lines = [
    `# ${data.date}`,
    await body(event, data.content),
    ...relatedEntities(event, data.relatedEntities),
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
  const data = await buildPublicPage(page, false);
  const lines = [
    `# ${data.title}`,
    data.summary,
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
      found = findContentEntity(reference, false).then((entity) =>
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
 * Relations as the sidebar lists them: plain ones first, then the two
 * directed kinds, each named from this entity's side.
 */
function relatedEntities(
  event: H3Event,
  entities:
    | {
        title: string;
        href?: string;
        note?: string;
        relationType?: RelationType;
      }[]
    | undefined,
): string[] {
  const visible = (entities ?? []).filter(
    (entity) => !isPublicSecret(entity as object),
  );
  if (!visible.length) return [];
  const phrase = THEI_SERVER.phrase;
  const line = (entity: (typeof visible)[number]) =>
    `- [${entity.title}](${siteUrl(event, entity.href!)})` +
    (entity.note ? ` — ${entity.note}` : '');
  const lines = [`## ${phrase.related_entities}`];
  lines.push(
    ...visible
      .filter((entity) => (entity.relationType ?? 'related') === 'related')
      .map(line),
  );
  for (const [type, title] of [
    ['influencing', phrase.relation_group_depends_on],
    ['dependent', phrase.relation_group_affects],
  ] as const) {
    const group = visible.filter((entity) => entity.relationType === type);
    if (group.length) lines.push(`### ${title}`, ...group.map(line));
  }
  return lines;
}

/** The diary entries tied to a project or an event, newest first. */
function diaryList(
  event: H3Event,
  entries: PublicDiaryLink[] | undefined,
): string[] {
  if (!entries?.length) return [];
  return [
    `## ${THEI_SERVER.phrase.diary_entries}`,
    ...entries.map(
      (entry) =>
        `- [${entry.date}](${siteUrl(event, entry.href)})` +
        (entry.excerpt ? ` — ${entry.excerpt}` : ''),
    ),
  ];
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
          `[${tag.title}](${siteUrl(event, `/tags/${tag.slug}-${tag.publicId}/`)})`,
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
