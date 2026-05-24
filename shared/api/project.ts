import type { ProjectEventAccessLevel } from '../access-level';

export type ProjectSlugCheckResponse = {
  taken: boolean;
};

export type ProjectGetResponse = {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
  iconAssetUuid?: string;
  iconPreviewUrl?: string;
};

export type ProjectSaveResponse =
  | { type: 'success'; projectUuid: string }
  | { type: 'error'; message: string };
