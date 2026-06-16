import { ProjectEventAccessLevel } from '../access-level';
import {
  ContentValidationError,
  normalizeContentData,
  type ContentFieldModelValue,
} from '../content';
import { isOneOf } from '../utils/isOneOf';

/** Base save item for any project asset list (showcase, other-assets, …). */
export type AssetListSaveItem = { assetUuid: string };

export type ShowcaseAssetEditItem = AssetListSaveItem & {
  caption?: string;
  isPrivate: boolean;
};

export type OtherAssetSaveItem = AssetListSaveItem & {
  title: string;
  caption?: string;
  isPrivate: boolean;
};

export type ProjectEditData = {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel | '';
  important: boolean;
  cv: boolean;
  iconAssetUuid?: string;
  bannerAssetUuid?: string;
  descriptionContent?: ContentFieldModelValue | null;
  /** Showcase assets in display order. Array index = sort order. */
  showcaseAssets?: ShowcaseAssetEditItem[];
  /** Other files in display order. Array index = sort order. */
  otherAssets?: OtherAssetSaveItem[];
};

export type ProjectEditClientValidation = {
  isSlugUnique: boolean;
};

export type ValidatedProjectEditData = Omit<ProjectEditData, 'access'> & {
  access: ProjectEventAccessLevel;
};

export function validateProjectData(
  data: ProjectEditData,
): string | ValidatedProjectEditData {
  const title = data.title?.trim();
  if (!title) return 'Title cannot be empty';

  const summary = data.summary?.trim();
  if (!summary) return 'Summary cannot be empty';

  const slug = data.slug?.trim();
  if (!slug) return 'Slug cannot be empty';

  if (!isOneOf(data.access, ProjectEventAccessLevel))
    return 'Invalid access level';

  try {
    const showcaseAssets: ShowcaseAssetEditItem[] | undefined =
      data.showcaseAssets === undefined
        ? undefined
        : validateUniqueAssetList(
            data.showcaseAssets.map((item) => {
              const isPrivate = validateProjectAssetIsPrivate(item.isPrivate);
              if (isPrivate === undefined)
                throw new ProjectValidationError('Invalid asset privacy');

              return {
                assetUuid: item.assetUuid,
                caption: normalizeOptionalText(item.caption),
                isPrivate,
              };
            }),
            'Duplicate showcase asset',
          );

    const otherAssets: OtherAssetSaveItem[] | undefined =
      data.otherAssets === undefined
        ? undefined
        : validateUniqueAssetList(
            data.otherAssets.map((item) => {
              const isPrivate = validateProjectAssetIsPrivate(item.isPrivate);
              if (isPrivate === undefined)
                throw new ProjectValidationError('Invalid asset privacy');

              const itemTitle = normalizeOptionalText(item.title);
              if (!itemTitle) {
                throw new ProjectValidationError(
                  'Other file title cannot be empty',
                );
              }

              return {
                assetUuid: item.assetUuid,
                title: itemTitle,
                caption: normalizeOptionalText(item.caption),
                isPrivate,
              };
            }),
            'Duplicate other file',
          );

    const descriptionContent = validateContentField(data.descriptionContent);

    return {
      ...data,
      title,
      summary,
      slug,
      access: data.access,
      descriptionContent,
      showcaseAssets,
      otherAssets,
    };
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.message;
    if (error instanceof ContentValidationError) return error.message;
    throw error;
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function validateProjectAssetIsPrivate(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function validateContentField(
  value: ContentFieldModelValue | null | undefined,
): ContentFieldModelValue | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return {
    contentUuid: normalizeOptionalText(value.contentUuid),
    data: normalizeContentData(value.data),
  };
}

function validateUniqueAssetList<T extends AssetListSaveItem>(
  items: T[],
  message: string,
): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.assetUuid)) {
      throw new ProjectValidationError(message);
    }
    seen.add(item.assetUuid);
  }
  return items;
}

class ProjectValidationError extends Error {}
