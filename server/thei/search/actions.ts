import { dayQueryRank, parseDayQuery } from '#layers/thei/shared/day-query';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import {
  publicIdFromProjectSectionUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import {
  SEARCH_ADMIN_SECTIONS,
  type SearchAction,
  type SearchAdminSection,
  type SearchKind,
} from '#layers/thei/shared/search/api';
import { matchName } from '#layers/thei/shared/search/match';
import { isQuestion } from '#layers/thei/shared/search/tokens';
import { normalizeTermText } from '#layers/thei/shared/text-terms';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { searchAnalyzer } from './analyzer';

/**
 * What the owner may do from the quick search, besides finding.
 *
 * Each follows from how the archive is kept. A diary entry costs least, so
 * the day comes first: today's with no query, the day a query names with
 * one. Then the entity the owner is looking at, the other side of it — its
 * editor, or its page. A query also offers to make a project, an event or a
 * page with its words for a title, to go to a part of the admin by its name,
 * and, with AI on, to ask the site's model. Nothing that cannot be undone, and
 * nothing rare: those stay in their forms.
 */
export interface SearchActionContext {
  q: string;
  /** The address the owner is on, without the base. */
  path?: string;
  /** Today in the owner's own time: their diary's day. */
  today: string;
}

const SECTION_HREFS: Record<SearchAdminSection, string> = {
  projects: '/admin/projects/',
  events: '/admin/events/',
  diary: '/admin/diary/',
  pages: '/admin/pages/',
  tags: '/admin/tags/',
  files: '/admin/assets/',
  profile: '/admin/about/',
  settings: '/admin/settings/',
  updates: '/admin/updates/',
  ai: '/admin/ai/',
};

function sectionName(section: SearchAdminSection): string {
  const phrase = THEI_SERVER.phrase;
  return {
    projects: phrase.projects,
    events: phrase.events,
    diary: phrase.diary,
    pages: phrase.pages,
    tags: phrase.tags,
    files: phrase.asset_library,
    profile: phrase.about_me,
    settings: phrase.settings,
    updates: phrase.admin_updates,
    ai: phrase.ai_page,
  }[section];
}

function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The one day a query names: «вчера», «12 марта», «12.03.2025». A month or a
 * year names many days and none of them. A day of the month without a year is
 * the last such day up to today.
 */
export function namedDay(q: string, today: string): string | undefined {
  const shift = searchAnalyzer().relativeDay(normalizeTermText(q.trim()));
  if (shift !== undefined) return shiftDay(today, shift);
  const query = parseDayQuery(q);
  if (!query) return undefined;
  const found: string[] = [];
  for (let back = 0; back < 3 * 366 && found.length < 4; back++) {
    const day = shiftDay(today, -back);
    if (dayQueryRank(day, query) !== undefined) found.push(day);
  }
  if (!found.length) return undefined;
  const sameDay = found.every((day) => day.slice(5) === found[0]!.slice(5));
  const sameYear = found.every(
    (day) => day.slice(0, 4) === found[0]!.slice(0, 4),
  );
  return sameDay && (found.length === 1 || !sameYear) ? found[0] : undefined;
}

function diaryAction(date: string, today: string): SearchAction {
  const { rawDb } = THEI_SERVER.useDb();
  const entry = rawDb
    .prepare('SELECT diaryUuid FROM "diary-entries" WHERE date = ?')
    .get(date) as { diaryUuid: string } | undefined;
  return {
    type: 'diary',
    date,
    today: date === today,
    exists: Boolean(entry),
    href: entry
      ? `/admin/diary/${entry.diaryUuid}/edit/`
      : `/admin/diary/new/?date=${date}`,
  };
}

/** The entity behind an address of the site or of its editor, as two sides. */
function sidesOf(path: string | undefined): SearchAction | undefined {
  if (!path) return undefined;
  const { rawDb } = THEI_SERVER.useDb();
  const row = (sql: string, value: string) =>
    rawDb.prepare(sql).get(value) as Record<string, string> | undefined;
  const editor =
    /^\/admin\/(projects|events|pages|diary)\/([^/]+)\/edit\/?$/u.exec(path);
  if (editor) {
    const [, section, id] = editor as unknown as [string, string, string];
    if (section === 'projects') {
      const found = row(
        'SELECT title, humanReadableSlug, publicId FROM projects WHERE projectUuid = ?',
        id,
      );
      return (
        found && {
          type: 'view',
          kind: 'project',
          title: found.title!,
          href: buildProjectUrl(found.humanReadableSlug!, found.publicId!),
        }
      );
    }
    if (section === 'events') {
      const found = row(
        'SELECT title, humanReadableSlug, publicId FROM events WHERE eventUuid = ?',
        id,
      );
      return (
        found && {
          type: 'view',
          kind: 'event',
          title: found.title!,
          href: buildEventUrl(found.humanReadableSlug!, found.publicId!),
        }
      );
    }
    if (section === 'pages') {
      const found = row('SELECT title, slug FROM pages WHERE pageUuid = ?', id);
      return (
        found && {
          type: 'view',
          kind: 'page',
          title: found.title!,
          href: buildPageUrl(found.slug!),
        }
      );
    }
    const found = row(
      'SELECT date FROM "diary-entries" WHERE diaryUuid = ?',
      id,
    );
    return (
      found && {
        type: 'view',
        kind: 'diary-entry',
        title: found.date!,
        href: buildDiaryUrl(found.date!),
      }
    );
  }
  // A section's page: the section in its project's editor.
  const [, projectPart, sectionPart] =
    /^\/projects\/([^/]+)\/([^/]+)\/?$/u.exec(path) ?? [];
  if (projectPart && sectionPart) {
    const found = rawDb
      .prepare(
        `SELECT s.title, s.publicId, p.projectUuid FROM "project-content-sections" s
         JOIN projects p ON p.projectUuid = s.projectUuid
         WHERE s.publicId = ? AND p.publicId = ?`,
      )
      .get(
        publicIdFromProjectSectionUrlPart(sectionPart),
        publicIdFromProjectUrlPart(projectPart),
      ) as { title: string; publicId: string; projectUuid: string } | undefined;
    if (found)
      return {
        type: 'edit',
        kind: 'project-section',
        title: found.title,
        href: `/admin/projects/${found.projectUuid}/edit/?section=${found.publicId}`,
      };
  }
  const [, section, part] =
    /^\/(projects|events|diary|pages)\/([^/]+)\/?$/u.exec(path) ?? [];
  if (!section || !part) return undefined;
  let found: Record<string, string> | undefined;
  let kind: SearchKind;
  let edit: string;
  if (section === 'projects') {
    found = row(
      'SELECT projectUuid AS id, title FROM projects WHERE publicId = ?',
      publicIdFromProjectUrlPart(part),
    );
    kind = 'project';
    edit = `/admin/projects/${found?.id}/edit/`;
  } else if (section === 'events') {
    found = row(
      'SELECT eventUuid AS id, title FROM events WHERE publicId = ?',
      publicIdFromEventUrlPart(part),
    );
    kind = 'event';
    edit = `/admin/events/${found?.id}/edit/`;
  } else if (section === 'pages') {
    found = row('SELECT pageUuid AS id, title FROM pages WHERE slug = ?', part);
    kind = 'page';
    edit = `/admin/pages/${found?.id}/edit/`;
  } else {
    const date = dateFromDiaryUrlPart(part);
    found = date
      ? row(
          'SELECT diaryUuid AS id, date AS title FROM "diary-entries" WHERE date = ?',
          date,
        )
      : undefined;
    kind = 'diary-entry';
    edit = `/admin/diary/${found?.id}/edit/`;
  }
  return found && { type: 'edit', kind, title: found.title!, href: edit };
}

/** What the owner saved last: five entities, newest first. */
function recentActions(): SearchAction[] {
  const { rawDb } = THEI_SERVER.useDb();
  const rows = rawDb
    .prepare(
      `SELECT 'project' AS kind, projectUuid AS id, title, access, updatedAt FROM projects
       UNION ALL SELECT 'event', eventUuid, title, access, updatedAt FROM events
       UNION ALL SELECT 'page', pageUuid, title, access, updatedAt FROM pages
       UNION ALL SELECT 'diary-entry', diaryUuid, date, access, updatedAt FROM "diary-entries"
       ORDER BY updatedAt DESC LIMIT 5`,
    )
    .all() as {
    kind: SearchKind;
    id: string;
    title: string;
    access: string;
    updatedAt: number;
  }[];
  const editors: Partial<Record<SearchKind, string>> = {
    project: 'projects',
    event: 'events',
    page: 'pages',
    'diary-entry': 'diary',
  };
  return rows.map((row) => ({
    type: 'recent',
    kind: row.kind,
    title: row.title,
    href: `/admin/${editors[row.kind]}/${row.id}/edit/`,
    updatedAt: row.updatedAt,
    ...(row.access === 'private' || row.access === 'link-only'
      ? { access: row.access }
      : {}),
  }));
}

export function searchActions(context: SearchActionContext): SearchAction[] {
  const q = context.q.trim();
  const sides = sidesOf(context.path);
  if (!q)
    return [
      diaryAction(context.today, context.today),
      ...(sides ? [sides] : []),
      ...recentActions(),
    ];
  const actions: SearchAction[] = [];
  const day = namedDay(q, context.today);
  if (day) actions.push(diaryAction(day, context.today));
  const aiOn = Boolean(THEI_SERVER.config?.mcp?.enabled);
  for (const section of SEARCH_ADMIN_SECTIONS) {
    if (section === 'ai' && !aiOn) continue;
    if (matchName(q, sectionName(section), searchAnalyzer()))
      actions.push({ type: 'section', section, href: SECTION_HREFS[section] });
  }
  // A question is asked of the model, first; nothing is made with it for a
  // title, nor with a day.
  if (isQuestion(q, searchAnalyzer())) {
    if (aiOn) actions.unshift({ type: 'ask-ai', text: q });
    return actions;
  }
  if (day) return aiOn ? [...actions, { type: 'ask-ai', text: q }] : actions;
  // The smaller first, as the archive is kept: an event costs less than a
  // project.
  const title = encodeURIComponent(q);
  actions.push(
    {
      type: 'create',
      kind: 'event',
      title: q,
      href: `/admin/events/new/?title=${title}`,
    },
    {
      type: 'create',
      kind: 'project',
      title: q,
      href: `/admin/projects/new/?title=${title}`,
    },
    {
      type: 'create',
      kind: 'page',
      title: q,
      href: `/admin/pages/new/?title=${title}`,
    },
  );
  if (aiOn) actions.push({ type: 'ask-ai', text: q });
  return actions;
}
