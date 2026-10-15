import type { ProjectEventAccessLevel } from './access-level';
import type { ContentFieldModelValue } from './content';

export type PageEditData = {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel | '';
  iconAssetUuid?: string;
  content: ContentFieldModelValue | null;
  reminder?: string;
  notes?: ContentFieldModelValue | null;
  /** The version the form was read at; a save over a newer one is refused. */
  version?: number;
};

export type ValidatedPageEditData = Omit<PageEditData, 'access'> & {
  access: ProjectEventAccessLevel;
};
