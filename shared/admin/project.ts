import { ProjectEventAccessLevel } from '../access-level';
import { isOneOf } from '../utils/isOneOf';

export type ProjectEditData = {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel | '';
  important: boolean;
  cv: boolean;
  iconAssetUuid?: string;
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
