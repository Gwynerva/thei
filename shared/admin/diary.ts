import { ProjectEventAccessLevel } from '../access-level';
import { normalizeEntityNotes, normalizeEntityReminder } from '../entity-notes';
import {
  ContentValidationError,
  createEmptyContentFieldValue,
  isContentEmpty,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import { isOneOf } from '../utils/isOneOf';
import { optionalContentDraftRef } from '../content-history';
import { isLifeDay } from '../life';
import type { DiaryEditData, ValidatedDiaryEditData } from '../diary';
import { ExcerptError, normalizeExcerpts } from '../excerpt';
import {
  RELATION_TARGET_TYPES,
  RelationValidationError,
  validateRelations,
} from '../relation';

/**
 * Whether a diary entry says anything: a text of the day, or at least one
 * excerpt. The one rule, read by the server when the entry is saved, by the
 * form before it offers Save, and by an AI write that would empty the text.
 */
export function diaryEntrySaysSomething(
  content: ContentFieldModelValue | null | undefined,
  excerpts: readonly unknown[] | undefined,
): boolean {
  if (excerpts?.length) return true;
  if (!content) return false;
  return !isContentEmpty(normalizeContentData(content.data));
}

export function validateDiaryData(
  data: DiaryEditData,
): string | ValidatedDiaryEditData {
  try {
    const date = data.date?.trim();
    if (!date) return 'Date cannot be empty';
    if (!isLifeDay(date)) return 'Invalid date';
    if (!isOneOf(data.access, ProjectEventAccessLevel))
      return 'Invalid access level';
    const excerpts = normalizeExcerpts(data.excerpts);

    return {
      ...data,
      date,
      access: data.access,
      content: validateDiaryContent(data.content, Boolean(excerpts?.length)),
      relations: validateRelations(data.relations, {
        allowed: RELATION_TARGET_TYPES,
      }),
      excerpts,
      reminder: normalizeEntityReminder(data.reminder),
      notes: normalizeEntityNotes(data.notes),
    };
  } catch (error) {
    if (
      error instanceof ContentValidationError ||
      error instanceof RelationValidationError ||
      error instanceof ExcerptError ||
      error instanceof Error
    )
      return error.message;
    throw error;
  }
}

/**
 * The text of the day. It is the entry, so it is required — unless the day
 * is told by its excerpts, when it may be left empty.
 */
function validateDiaryContent(
  value: ContentFieldModelValue | null | undefined,
  hasExcerpts: boolean,
): ContentFieldModelValue {
  if (!value) {
    if (hasExcerpts) return createEmptyContentFieldValue();
    throw new Error('Diary entry content is required');
  }
  const data = normalizeContentData(value.data);
  if (isContentEmpty(data) && !hasExcerpts)
    throw new Error('Diary entry content is required');
  return {
    contentUuid: value.contentUuid?.trim() || undefined,
    data,
    ...(typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? { updatedAt: value.updatedAt }
      : {}),
    ...optionalContentDraftRef(value.draftRef),
  };
}
