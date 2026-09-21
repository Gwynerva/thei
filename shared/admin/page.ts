import { ProjectEventAccessLevel } from '../access-level';
import { normalizeEntityNotes, normalizeEntityReminder } from '../entity-notes';
import {
  ContentValidationError,
  isContentEmpty,
  normalizeContentData,
} from '../content';
import type { PageEditData, ValidatedPageEditData } from '../page';
import { normalizeUrlSegment } from '../language/slugify';
import { isOneOf } from '../utils/isOneOf';

export function normalizePageSlug(value: unknown) {
  return normalizeUrlSegment(value);
}

/**
 * A slug is acceptable when something survives normalization. What the admin
 * typed is cleaned rather than refused, because the field shows the cleaned
 * value as it is typed — refusing it twice would only be pedantry.
 */
export function pageSlugIsValid(value: unknown): value is string {
  return Boolean(normalizePageSlug(value));
}

export function pageSlugIsTaken(
  slug: string,
  registeredSlugs: readonly string[],
  currentSlug?: string,
) {
  const normalized = normalizePageSlug(slug);
  const current = normalizePageSlug(currentSlug);
  return registeredSlugs.some((item) => {
    const registered = normalizePageSlug(item);
    return registered === normalized && registered !== current;
  });
}

export function validatePageData(
  data: PageEditData | null | undefined,
): string | ValidatedPageEditData {
  if (!data || typeof data !== 'object') return 'Invalid page data';
  const title = data.title?.trim();
  if (!title) return 'Title cannot be empty';
  const summary = data.summary?.trim();
  if (!summary) return 'Summary cannot be empty';
  const slug = normalizePageSlug(data.slug);
  if (!slug) return 'Slug cannot be empty';
  if (!pageSlugIsValid(slug)) return 'Invalid slug';
  if (!isOneOf(data.access, ProjectEventAccessLevel))
    return 'Invalid access level';

  try {
    const contentData = normalizeContentData(data.content?.data);
    if (isContentEmpty(contentData)) return 'Page content is required';
    const iconAssetUuid = data.iconAssetUuid?.trim() || undefined;
    return {
      title,
      summary,
      slug,
      access: data.access,
      iconAssetUuid,
      content: {
        contentUuid: data.content?.contentUuid?.trim() || undefined,
        data: contentData,
        ...(typeof data.content?.updatedAt === 'number' &&
        Number.isFinite(data.content.updatedAt)
          ? { updatedAt: data.content.updatedAt }
          : {}),
      },
      reminder: normalizeEntityReminder(data.reminder),
      notes: normalizeEntityNotes(data.notes),
    };
  } catch (error) {
    if (error instanceof ContentValidationError || error instanceof Error)
      return error.message;
    throw error;
  }
}
