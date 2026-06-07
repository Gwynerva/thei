import { ProjectEventAccessLevel } from '../access-level';
import { isOneOf } from '../utils/isOneOf';

const PROJECT_ASSET_ACCESS_LEVELS = ['project', 'private'] as const;
type ProjectAssetAccessLevel = (typeof PROJECT_ASSET_ACCESS_LEVELS)[number];

/** Base save item for any project asset list (showcase, other-assets, …). */
export type AssetListSaveItem = { assetUuid: string };

export type ShowcaseAssetEditItem = AssetListSaveItem & {
  caption?: string;
  access: ProjectAssetAccessLevel;
};

export type OtherAssetSaveItem = AssetListSaveItem & {
  title: string;
  caption?: string;
  access: ProjectAssetAccessLevel;
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
        : data.showcaseAssets.map((item) => {
            const access = validateProjectAssetAccess(item.access);
            if (!access)
              throw new ProjectValidationError('Invalid asset access');

            return {
              assetUuid: item.assetUuid,
              caption: normalizeOptionalText(item.caption),
              access,
            };
          });

    const otherAssets: OtherAssetSaveItem[] | undefined =
      data.otherAssets === undefined
        ? undefined
        : data.otherAssets.map((item) => {
            const access = validateProjectAssetAccess(item.access);
            if (!access)
              throw new ProjectValidationError('Invalid asset access');

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
              access,
            };
          });

    return {
      ...data,
      title,
      summary,
      slug,
      access: data.access,
      showcaseAssets,
      otherAssets,
    };
  } catch (error) {
    if (error instanceof ProjectValidationError) return error.message;
    throw error;
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function validateProjectAssetAccess(
  value: unknown,
): ProjectAssetAccessLevel | undefined {
  return PROJECT_ASSET_ACCESS_LEVELS.includes(value as ProjectAssetAccessLevel)
    ? (value as ProjectAssetAccessLevel)
    : undefined;
}

class ProjectValidationError extends Error {}
