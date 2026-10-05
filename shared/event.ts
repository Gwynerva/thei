import type { ContentFieldModelValue } from './content';
import type { Period } from './period';
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
  periods: Period[];
  content: ContentFieldModelValue | null;
  /** The picture the event's page opens with and its cards show. */
  bannerAssetUuid?: string;
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
