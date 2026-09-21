import type { H3Event } from 'h3';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { isPublicSecret } from '#layers/thei/shared/api/public';
import { contentToMarkdown } from '#layers/thei/shared/content-markdown';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildProjectChildUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import {
  buildPublicEvent,
  buildPublicPage,
  buildPublicProject,
  buildPublicProjectSection,
  buildPublicProjectStage,
  canOpenPublicEntity,
} from '../public/entities';
import { listPublicProjectEvents } from '../public/project-events';
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
    body(event, data.description),
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
  lines.push(...relatedProjects(event, data.relatedProjects));
  // `buildPublicProject` deliberately leaves related events out: they are
  // paginated, and the page asks for its own first page of them.
  const related = await listPublicProjectEvents(project, false, 1, 20);
  if (related.items.length) {
    lines.push(`## ${THEI_SERVER.phrase.related_events}`);
    for (const item of related.items)
      lines.push(`- [${item.title}](${siteUrl(event, item.href)})`);
  }
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
    body(event, data.content),
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
    body(event, data.content),
    ...relatedProjects(event, data.relatedProjects),
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

export async function renderPageMarkdown(
  event: H3Event,
  slug: string,
): Promise<MarkdownDocument | undefined> {
  const page = await THEI_SERVER.pages.findBySlug(slug);
  if (!page || page.access === ProjectEventAccessLevel.Private)
    return undefined;
  const data = await buildPublicPage(page, false);
  const lines = [`# ${data.title}`, data.summary, body(event, data.content)];
  return {
    body: join(lines),
    canonical: siteUrl(event, buildPageUrl(page.slug)),
  };
}

function body(
  event: H3Event,
  content: Parameters<typeof contentToMarkdown>[0],
): string {
  return contentToMarkdown(content, {
    absolute: (path) => siteUrl(event, path),
    privateSectionLabel: THEI_SERVER.phrase.secret_hint,
  });
}

function relatedProjects(
  event: H3Event,
  projects: { title: string; href?: string; note?: string }[] | undefined,
): string[] {
  const visible = (projects ?? []).filter(
    (project) => !isPublicSecret(project as object),
  );
  if (!visible.length) return [];
  return [
    `## ${THEI_SERVER.phrase.related_projects}`,
    ...visible.map(
      (project) =>
        `- [${project.title}](${siteUrl(event, project.href!)})` +
        (project.note ? ` — ${project.note}` : ''),
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
