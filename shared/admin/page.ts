import { ProjectEventAccessLevel } from '../access-level';
import {
  ContentValidationError,
  isContentEmpty,
  normalizeContentData,
} from '../content';
import type { PageEditData, ValidatedPageEditData } from '../page';
import { slugify } from '../language/slugify';
import { isOneOf } from '../utils/isOneOf';

export function normalizePageSlug(value: unknown) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

export function pageSlugIsValid(value: unknown): value is string {
  const slug = normalizePageSlug(value);
  return Boolean(slug) && slugify(slug) === slug;
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
    };
  } catch (error) {
    if (error instanceof ContentValidationError || error instanceof Error)
      return error.message;
    throw error;
  }
}
