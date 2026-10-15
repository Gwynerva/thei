import type { Period } from '#layers/thei/shared/period';
import type { RelationNote } from '#layers/thei/shared/relation';
import type { McpEntityView, McpRelation } from './entities';

/**
 * An entity as a model reads it: a short document with its fields, each text
 * in editing Markdown under its own heading, and what it is tied to.
 * A text longer than a page is cut where a block ends, and says how to read
 * on.
 */
export function renderEntity(view: McpEntityView): string {
  const lines: string[] = [`# ${view.ref} — ${view.title}`, ''];
  lines.push(`version: ${view.version}`);
  for (const [key, value] of Object.entries(view.fields))
    lines.push(`${key}: ${formatValue(value)}`);
  if (view.project)
    lines.push(`project: ${view.project.ref} — ${view.project.title}`);
  if (view.periods?.length)
    lines.push(`periods: ${view.periods.map(formatPeriod).join('; ')}`);

  for (const text of view.texts) {
    const page = pageOfText(text.markdown, 0);
    lines.push(
      '',
      `## Text "${text.name}"${text.private ? ' — private, only the owner sees it' : ''} (version ${text.version ?? 'none: empty'})`,
      `What it is: ${text.about}`,
      '',
      page.part || '_(empty)_',
    );
    if (page.next !== null)
      lines.push(
        '',
        `… ${text.markdown.length - page.next} more characters: read_entity with text "${text.name}", offset ${page.next}`,
      );
  }

  if (view.sections?.length) {
    lines.push('', '## Sections', '');
    for (const section of view.sections)
      lines.push(
        `- ${section.ref} — ${section.title}${
          section.periods.length
            ? ` (stage: ${section.periods.map(formatPeriod).join('; ')})`
            : ' (general section)'
        }${section.isPrivate ? ' [private]' : ''}${section.hasBody ? '' : ' [no text]'}`,
      );
  }
  if (view.tags) {
    lines.push('', '## Tags', '');
    lines.push(
      ...(view.tags.length
        ? view.tags.map((tag) => `- ${tag.ref} — ${tag.title}`)
        : ['_(none)_']),
    );
  }
  if (view.relations) {
    lines.push('', '## Relations', '');
    lines.push(
      ...(view.relations.length
        ? view.relations.map(formatRelation)
        : ['_(none)_']),
    );
  }
  if (view.linkedInText?.length) {
    lines.push('', '## Linked from its texts', '');
    for (const link of view.linkedInText)
      lines.push(
        `- ${link.ref} — ${link.title}${link.related ? ' (also related)' : ''}`,
      );
  }
  lines.push(
    '',
    `Admin: ${view.urls.admin}${view.urls.public ? ` · Public: ${view.urls.public}` : ''}`,
  );
  return lines.join('\n');
}

/** How much of a text one read gives. */
export const TEXT_PAGE = 20_000;

/**
 * A part of a text from `offset`, ending where a block does when one ends in
 * the second half of the page, else where a line does, so a model reading on
 * gets whole paragraphs. `next` is where the following part starts.
 */
export function pageOfText(markdown: string, offset: number) {
  const from = Math.min(offset, markdown.length);
  if (markdown.length - from <= TEXT_PAGE)
    return {
      part: markdown.slice(from),
      from,
      to: markdown.length,
      next: null,
    };
  const window = markdown.slice(from, from + TEXT_PAGE);
  const block = window.lastIndexOf('\n\n');
  const line = window.lastIndexOf('\n');
  const cut =
    block >= TEXT_PAGE / 2
      ? block + 2
      : line >= TEXT_PAGE / 2
        ? line + 1
        : TEXT_PAGE;
  return {
    part: window.slice(0, cut).trimEnd(),
    from,
    to: from + cut,
    next: from + cut,
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value ? JSON.stringify(value) : '""';
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item) =>
            item && typeof item === 'object' && 'ref' in item
              ? `${(item as { ref: string }).ref} (${(item as { title?: string }).title ?? ''})`
              : JSON.stringify(item),
          )
          .join(', ')
      : '[]';
  return String(value);
}

export function formatPeriod(period: Period): string {
  const dates =
    period.startDate === period.endDate
      ? period.startDate
      : `${period.startDate}…${period.endDate}`;
  const precision =
    period.precision && period.precision !== 'exact'
      ? ` ~${period.precision}${period.precisionNote ? ` (${period.precisionNote})` : ''}`
      : '';
  return `${dates}${precision}${period.label ? ` "${period.label}"` : ''}`;
}

const RELATION_WORDS: Record<McpRelation['kind'], string> = {
  related: 'related to',
  'depends-on': 'depends on',
  affects: 'affects',
};

function formatNote(note: RelationNote | undefined): string {
  if (!note) return '';
  if (note.type === 'shared') return note.text ? ` — note: ${note.text}` : '';
  const parts = [
    note.currentText ? `this side: ${note.currentText}` : '',
    note.relatedText ? `other side: ${note.relatedText}` : '',
  ].filter(Boolean);
  return parts.length ? ` — notes: ${parts.join('; ')}` : '';
}

function formatRelation(relation: McpRelation): string {
  return `- ${RELATION_WORDS[relation.kind]} ${relation.ref} — ${relation.title}${formatNote(relation.note)}`;
}
