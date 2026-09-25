import type { ContentFieldModelValue } from './content';
import type { DatedPeriod } from './date-precision';
import type { ProjectEventAccessLevel } from './access-level';
import type { ProjectActionEditData } from './project-action';
import type { OtherAssetSaveItem } from './admin/project';
import type { ExternalLinkListItem } from './external-link';
import type { TagEditItem } from './tag';
import type { MediaDescriptor } from './media';
import type { RelationEditItem } from './relation';

export type EventEditData = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel | '';
  humanReadableSlug: string;
  publicId: string;
  periods: DatedPeriod[];
  content: ContentFieldModelValue | null;
  otherAssets?: OtherAssetSaveItem[];
  externalLinks?: ExternalLinkListItem[];
  tags?: TagEditItem[];
  relations?: RelationEditItem[];
  action?: ProjectActionEditData;
  reminder?: string;
  notes?: ContentFieldModelValue | null;
};

export type ValidatedEventEditData = Omit<
  EventEditData,
  'access' | 'action'
> & {
  access: ProjectEventAccessLevel;
  action: ProjectActionEditData;
};
