import { ProjectEventAccessLevel } from '../access-level';
import { isOneOf } from '../utils/isOneOf';

/** Base save item for any project asset list (showcase, other-assets, …). */
export type AssetListSaveItem = { assetUuid: string };

export type ShowcaseAssetEditItem = AssetListSaveItem & {
  caption?: string;
  access: 'project' | 'private';
};

export type OtherAssetSaveItem = AssetListSaveItem & {
  title: string;
  caption?: string;
  access: 'project' | 'private';
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

  return { ...data, title, summary, slug, access: data.access };
}
