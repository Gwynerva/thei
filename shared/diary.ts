import type { ContentFieldModelValue } from './content';
import type { ProjectEventAccessLevel } from './access-level';
import type { RelationEditItem } from './relation';

/**
 * A diary entry as its form holds it.
 *
 * Deliberately short. There is no title, no summary, no tags and no action:
 * the entry is a thought with a date, and everything an event or a project
 * needs in order to be presentable is exactly what a diary entry is free of.
 */
export type DiaryEditData = {
  /** The day the entry belongs to, `YYYY-MM-DD`. */
  date: string;
  access: ProjectEventAccessLevel | '';
  content: ContentFieldModelValue | null;
  relations?: RelationEditItem[];
  reminder?: string;
};

export type ValidatedDiaryEditData = Omit<DiaryEditData, 'access'> & {
  access: ProjectEventAccessLevel;
};
