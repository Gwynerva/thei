import type { ContentFieldModelValue } from './content';
import type { DatedPeriod } from './date-precision';
import type { ProjectEventAccessLevel } from './access-level';
import type { ProjectActionEditData } from './project-action';
import type { OtherAssetSaveItem } from './admin/project';
import type { ProjectExternalLinkEditItem } from './external-link';
import type { TagEditItem } from './tag';
import type { MediaDescriptor } from './media';

export type EventEditData = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel | '';
  humanReadableSlug: string;
  publicId: string;
  periods: DatedPeriod[];
  content: ContentFieldModelValue | null;
  otherAssets?: OtherAssetSaveItem[];
  externalLinks?: ProjectExternalLinkEditItem[];
  tags?: TagEditItem[];
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
