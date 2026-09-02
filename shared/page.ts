import type { ProjectEventAccessLevel } from './access-level';
import type { ContentFieldModelValue } from './content';

export type PageEditData = {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel | '';
  iconAssetUuid?: string;
  content: ContentFieldModelValue | null;
};

export type ValidatedPageEditData = Omit<PageEditData, 'access'> & {
  access: ProjectEventAccessLevel;
};
