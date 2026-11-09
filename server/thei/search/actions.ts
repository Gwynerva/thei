import { resolveNamedDay, shiftDay } from '#layers/thei/shared/day-query';
import {
  SEARCH_ADMIN_SECTIONS,
  searchAdminSectionName,
  type SearchAction,
  type SearchAdminSection,
} from '#layers/thei/shared/search/api';
import { matchName } from '#layers/thei/shared/search/match';
import { isQuestion } from '#layers/thei/shared/search/tokens';
import { adminPath } from '../entity-kinds';
import { searchAnalyzer } from './analyzer';

/**
 * What the owner may do from the quick search, besides finding.
 *
 * Each follows from how the archive is kept. With nothing typed, what the
 * owner saved last, and nothing more: the admin bar already leads to the
 * diary and to the other side of the page they are on. A diary entry costs
 * least, so the day a query names comes first. A query also offers to make
 * a project, an event or a page with its words for a title, to go to a part
 * of the admin by its name, and, with AI on, to ask the site's model.
 * Nothing that cannot be undone, and nothing rare: those stay in their
 * forms.
 */
interface SearchActionContext {
  q: string;
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

/**
 * The one day a query names: «вчера», «12 марта», «12.03.2025». A month or a
 * year names many days and none of them. A day of the month without a year is
 * the last such day up to today.
 */
function namedDay(q: string, today: string): string | undefined {
  const names = resolveNamedDay(q, today, (word) =>
    searchAnalyzer().relativeDay(word),
  );
  if (!names) return undefined;
  const found: string[] = [];
  for (let back = 0; back < 3 * 366 && found.length < 4; back++) {
    const day = shiftDay(today, -back);
    if (names(day) !== undefined) found.push(day);
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
      ? adminPath('diary-entry', entry.diaryUuid)
      : `/admin/diary/new/?date=${date}`,
  };
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
    kind: 'project' | 'event' | 'page' | 'diary-entry';
    id: string;
    title: string;
    access: string;
    updatedAt: number;
  }[];
  return rows.map((row) => ({
    type: 'recent',
    kind: row.kind,
    title: row.title,
    href: adminPath(row.kind, row.id),
    updatedAt: row.updatedAt,
    ...(row.access === 'private' || row.access === 'link-only'
      ? { access: row.access }
      : {}),
  }));
}

export function searchActions(context: SearchActionContext): SearchAction[] {
  const q = context.q.trim();
  if (!q) return recentActions();
  const actions: SearchAction[] = [];
  const day = namedDay(q, context.today);
  if (day) actions.push(diaryAction(day, context.today));
  const aiOn = Boolean(THEI_SERVER.config?.mcp?.enabled);
  for (const section of SEARCH_ADMIN_SECTIONS) {
    if (section === 'ai' && !aiOn) continue;
    if (
      matchName(
        q,
        searchAdminSectionName(section, THEI_SERVER.phrase),
        searchAnalyzer(),
      )
    )
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
