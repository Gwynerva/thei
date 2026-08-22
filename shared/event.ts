import type { ContentFieldModelValue } from './content';
import type { DateRange } from './date-range';
import type { ProjectEventAccessLevel } from './access-level';
import type { ProjectActionEditData } from './project-action';
import type { OtherAssetSaveItem } from './admin/project';
import type { ProjectExternalLinkEditItem } from './external-link';
import type { TagEditItem } from './tag';
import type { MediaDescriptor } from './media';

export type EventProjectRelationEditItem = {
  projectUuid: string;
  note?: string;
  title?: string;
  summary?: string;
  humanReadableSlug?: string;
  publicId?: string;
  iconMedia?: MediaDescriptor;
};

export type EventEditData = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel | '';
  humanReadableSlug: string;
  publicId: string;
  periods: DateRange[];
  content: ContentFieldModelValue | null;
  otherAssets?: OtherAssetSaveItem[];
  externalLinks?: ProjectExternalLinkEditItem[];
  relations?: EventProjectRelationEditItem[];
  tags?: TagEditItem[];
  action?: ProjectActionEditData;
};

export type ValidatedEventEditData = Omit<
  EventEditData,
  'access' | 'action'
> & {
  access: ProjectEventAccessLevel;
  action: ProjectActionEditData;
};
