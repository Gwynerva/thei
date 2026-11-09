import type { ContentFieldModelValue } from './content';
import type { ProjectEventAccessLevel } from './access-level';
import type { ExcerptItem } from './excerpt';
import type { RelationEditItem } from './relation';

/**
 * A diary entry as its form holds it.
 *
 * Deliberately short. There is no title, no summary, no tags and no action:
 * the entry is a thought with a date, and everything an event or a project
 * needs in order to be presentable is exactly what a diary entry is free of.
 * Relations are the one structure it may carry: they are how an entry says
 * what it is about, and what puts it on a project's chronology. Its excerpts
 * are named parts of the day, each about something in the archive; a day
 * may be only its excerpts, with no text of its own.
 */
export type DiaryEditData = {
  /** The day the entry belongs to, `YYYY-MM-DD`. */
  date: string;
  access: ProjectEventAccessLevel | '';
  /** Empty only when the entry holds an excerpt. */
  content: ContentFieldModelValue | null;
  relations?: RelationEditItem[];
  /** The entry's excerpts in their order; absent leaves them as they are. */
  excerpts?: ExcerptItem[];
  reminder?: string;
  notes?: ContentFieldModelValue | null;
  /** The version the form was read at; a save over a newer one is refused. */
  version?: number;
};

export type ValidatedDiaryEditData = Omit<DiaryEditData, 'access'> & {
  access: ProjectEventAccessLevel;
};
