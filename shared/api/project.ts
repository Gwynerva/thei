import type { ProjectEventAccessLevel } from '../access-level';

export type ProjectSlugCheckResponse = {
  taken: boolean;
};

export type ProjectGetResponse = {
  projectUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
  iconAssetUuid?: string;
  iconPreviewUrl?: string;
  iconDominantHue?: number;
  bannerAssetUuid?: string;
  bannerPreviewUrl?: string;
};

export type ProjectSaveResponse =
  | { type: 'success'; projectUuid: string }
  | { type: 'error'; message: string };

export type ProjectListItem = {
  projectUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
  iconPreviewUrl?: string;
  iconDominantHue?: number;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
};
