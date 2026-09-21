import {
  isContentEmpty,
  normalizeContentData,
  type ContentEditValue,
  type ContentFieldModelValue,
  type ContentSlot,
} from './content';

/**
 * Two private fields every main entity carries: a short reminder that flags
 * the entity wherever it is listed, and longer notes kept at the bottom of its
 * page. Both are for the owner alone and never reach a visitor — not through
 * the API, not through the Markdown representation, not through search.
 */
export const ENTITY_REMINDER_MAX_LENGTH = 500;

export type EntityNotesOwner = 'project' | 'event' | 'page';

export const ENTITY_NOTES_SLOTS = {
  project: 'project-notes',
  event: 'event-notes',
  page: 'page-notes',
} as const satisfies Record<EntityNotesOwner, ContentSlot>;

export function entityNotesSlot(owner: EntityNotesOwner): ContentSlot {
  return ENTITY_NOTES_SLOTS[owner];
}

export interface EntityNotesEditData {
  reminder: string;
  notes: ContentFieldModelValue | null;
}

export function normalizeEntityReminder(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, ENTITY_REMINDER_MAX_LENGTH);
}

/**
 * Notes are optional, so empty content is stored as nothing at all rather than
 * as an empty document.
 */
export function normalizeEntityNotes(
  value: ContentFieldModelValue | null | undefined,
): ContentEditValue | null {
  const data = normalizeContentData(value?.data);
  if (isContentEmpty(data)) return null;
  return {
    contentUuid: value?.contentUuid?.trim() || undefined,
    data,
    ...(typeof value?.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? { updatedAt: value.updatedAt }
      : {}),
  };
}
