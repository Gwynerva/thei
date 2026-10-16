import type { McpEntityView, McpText } from './entities';
import { formatPeriod } from './render';

/**
 * What a text is, said to the model before the text itself: whose it is, what
 * part it plays and who reads it. The same words mean different work in a
 * diary entry and in a project's description, and a model that does not know
 * which it holds tidies one like the other.
 */

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function readers(view: McpEntityView, text: McpText): string {
  if (text.private) return 'Private notes: only the owner ever sees them.';
  if (view.kind === 'project-section')
    return view.fields.isPrivate
      ? 'The section is private: only the owner sees it.'
      : 'Shown with its project, to whoever may open the project.';
  switch (view.fields.access) {
    case 'public':
      return 'Public: anyone may read it.';
    case 'link-only':
      return 'Read by those who have its link.';
    case 'private':
      return 'The entity is private for now: only the owner sees it.';
    default:
      return 'Public: anyone may read it.';
  }
}

function when(view: McpEntityView): string {
  return view.periods?.length
    ? `, ${view.periods.map(formatPeriod).join('; ')}`
    : '';
}

/**
 * What a file's description is, said before it: whose it is, what it is for
 * and who reads it. It describes the file — never the text inside it.
 */
export function aboutFileDescription(publicly: boolean): string {
  return `The description of a file of the library, in the owner's words: what the file shows or is about — not its text, not a transcript — read in place of the file by search, by models and by whoever cannot see it. One serves the file and all its variants. ${
    publicly
      ? 'Public: whoever sees the file reads it, as the alt of a picture and in the window of the file.'
      : 'The file is on no public page: only the owner reads it.'
  }`;
}

export function aboutText(view: McpEntityView, text: McpText): string {
  const title = `“${view.title}”`;
  const seen = readers(view, text);
  switch (view.kind) {
    case 'diary-entry': {
      const date = String(view.fields.date);
      const day = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
      return text.private
        ? `The owner's notes on their diary entry of ${date}. ${seen}`
        : `The diary entry of ${day} ${date}: the owner's own account of that one day, in their own voice. One entry a day, with no title and no tags; whatever it holds stays that day's thought. ${seen}`;
    }
    case 'project':
      return text.private
        ? `The owner's working notes on the project ${title}: drafts, plans, to-dos. ${seen}`
        : `The description of the project ${title}: the whole project as a visitor first reads it on its page. Its parts are told in its ${view.sections?.length ?? 0} sections. ${seen}`;
    case 'project-section': {
      const place = view.stage
        ? `stage ${view.stage.index} of ${view.stage.count}`
        : 'a general section';
      return `The text of ${place} ${title} of the project “${view.project?.title ?? ''}”${when(view)}: one part of the project, read on its own page and among the project's sections, always under the project's title — so it needs no more context than the project gives. ${seen}`;
    }
    case 'event':
      return text.private
        ? `The owner's notes on the event ${title}. ${seen}`
        : `The story of the event ${title}${when(view)}: a small memorable moment in the owner's words. An event is never a part of a project. ${seen}`;
    case 'page':
      return text.private
        ? `The owner's notes on the page ${title}. ${seen}`
        : `The standalone page ${title}: writing that belongs to no timeline. ${seen}`;
    case 'profile':
      return `The owner's "About me" on the front page of the site: who they are, in their own words. ${seen}`;
    case 'tag':
      return `The description of the tag ${title}. ${seen}`;
  }
}
