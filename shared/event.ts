import type { ContentFieldModelValue } from './content';
import type { StagePeriod } from './stage-period';
import type { ProjectEventAccessLevel } from './access-level';
import type { ProjectActionEditData } from './project-action';
import type { OtherAssetSaveItem } from './admin/project';
import type {
  ExternalLinkListInput,
  ExternalLinkListItem,
} from './external-link';
import type { TagEditItem } from './tag';
import type { MediaDescriptor } from './media';
import type { RelationEditItem } from './relation';

export type EventEditData = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel | '';
  humanReadableSlug: string;
  publicId: string;
  periods: StagePeriod[];
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
  'access' | 'action' | 'externalLinks'
> & {
  access: ProjectEventAccessLevel;
  action: ProjectActionEditData;
  externalLinks?: ExternalLinkListInput[];
};
