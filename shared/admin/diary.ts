import { ProjectEventAccessLevel } from '../access-level';
import { normalizeEntityReminder } from '../entity-notes';
import {
  ContentValidationError,
  isContentEmpty,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import { isOneOf } from '../utils/isOneOf';
import { isLifeDay } from '../life';
import { validateRelations, RelationValidationError } from '../relation';
import type { DiaryEditData, ValidatedDiaryEditData } from '../diary';

export function validateDiaryData(
  data: DiaryEditData,
): string | ValidatedDiaryEditData {
  try {
    const date = data.date?.trim();
    if (!date) return 'Date cannot be empty';
    if (!isLifeDay(date)) return 'Invalid date';
    if (!isOneOf(data.access, ProjectEventAccessLevel))
      return 'Invalid access level';

    return {
      ...data,
      date,
      access: data.access,
      content: validateRequiredContent(data.content),
      relations: validateRelations(data.relations),
      reminder: normalizeEntityReminder(data.reminder),
    };
  } catch (error) {
    if (
      error instanceof ContentValidationError ||
      error instanceof RelationValidationError ||
      error instanceof Error
    )
      return error.message;
    throw error;
  }
}

function validateRequiredContent(
  value: ContentFieldModelValue | null | undefined,
) {
  if (!value) throw new Error('Diary entry content is required');
  const data = normalizeContentData(value.data);
  if (isContentEmpty(data)) throw new Error('Diary entry content is required');
  return {
    contentUuid: value.contentUuid?.trim() || undefined,
    data,
    ...(typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? { updatedAt: value.updatedAt }
      : {}),
  };
}
