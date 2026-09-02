import type { ProjectEventAccessLevel } from '../access-level';
import type { PublicContentOutputData } from '../content';
import type { DateRange } from '../date-range';
import type {
  ProjectActionBackgroundMode,
  ProjectActionBackgroundRepeat,
  ProjectActionBackgroundSize,
  ProjectActionTarget,
} from '../project-action';
import type { MediaDescriptor } from '../media';
import type { ArchivedOriginalFileMeta } from '../asset';
import type { ProjectRelationType } from '../admin/project';

export type PublicTagSummary = {
  title: string;
  slug: string;
  publicId: string;
  description?: string;
  accentColor?: string;
  iconMedia?: MediaDescriptor;
};

export type PublicProjectReference = {
  title: string;
  summary: string;
  href: string;
  iconMedia: MediaDescriptor;
  relationType?: ProjectRelationType;
};

export type PublicEntitySummary = {
  type: 'project' | 'event';
  title: string;
  summary: string;
  href: string;
  access: ProjectEventAccessLevel;
  media?: MediaDescriptor;
  tags: PublicTagSummary[];
  date: string;
  showcase?: boolean;
  relatedProjects?: PublicProjectReference[];
};

export type PublicPaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

export type PublicAssetDescriptor = {
  key: string;
  title: string;
  fileName?: string;
  description?: string;
  href: string;
  extension: string;
  size: number;
  media?: MediaDescriptor;
  archivedOriginal?: ArchivedOriginalFileMeta;
};

export type PublicFile = PublicAssetDescriptor;

export type PublicReferenceLink = {
  kind: 'external' | 'project' | 'event' | 'page';
  title: string;
  href: string;
  description?: string;
  iconMedia?: MediaDescriptor;
  relationType?: ProjectRelationType;
};

export type PublicReferenceGroup = {
  links: PublicReferenceLink[];
  files: PublicFile[];
};

export type PublicReferenceGroups = {
  manual: PublicReferenceGroup;
  content: PublicReferenceGroup;
};

export type PublicAction = {
  text: string;
  accentColor: string;
  target: ProjectActionTarget;
  href: string;
  iconMedia?: MediaDescriptor;
  fileMedia?: MediaDescriptor;
  faviconMedia?: MediaDescriptor;
  useFavicon: boolean;
  backgroundMedia?: MediaDescriptor;
  backgroundMode: ProjectActionBackgroundMode;
  backgroundSize: ProjectActionBackgroundSize;
  backgroundRepeat: ProjectActionBackgroundRepeat;
};

export type PublicProjectStage = {
  title: string;
  summary: string;
  href: string;
  date: string;
  period: DateRange;
  periods: DateRange[];
  media?: MediaDescriptor;
};

export type PublicProjectSection = {
  title: string;
  summary: string;
  href: string;
  date: string;
  media?: MediaDescriptor;
};

export type PublicProjectChildParent = PublicProjectReference & {
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
};

export type PublicProjectStageResponse = PublicProjectStage & {
  humanReadableSlug: string;
  publicId: string;
  content?: PublicContentOutputData;
  project: PublicProjectChildParent;
  references: PublicReferenceGroups;
};

export type PublicProjectSectionResponse = PublicProjectSection & {
  humanReadableSlug: string;
  publicId: string;
  content: PublicContentOutputData;
  project: PublicProjectChildParent;
  references: PublicReferenceGroups;
};

export type PublicProjectResponse = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  chronology: {
    createdAt: string;
    firstStageAt?: string;
    lastStageAt?: string;
    updatedAt: string;
  };
  isShowcase: boolean;
  isPortfolio: boolean;
  iconMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  description?: PublicContentOutputData;
  stages: PublicProjectStage[];
  sections: PublicProjectSection[];
  showcase: PublicAssetDescriptor[];
  files: PublicFile[];
  tags: PublicTagSummary[];
  relatedProjects: PublicProjectReference[];
  references: PublicReferenceGroups;
  action?: PublicAction;
};

export type PublicEventResponseFull = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  periods: DateRange[];
  content: PublicContentOutputData;
  references: PublicReferenceGroups;
  tags: PublicTagSummary[];
  relatedProjects: PublicProjectReference[];
  action?: PublicAction;
};

export type PublicTagListItem = PublicTagSummary & {
  projectCount: number;
  eventCount: number;
};

export type PublicTagResponse = PublicTagListItem & {
  activeTab: 'projects' | 'events';
  items: PublicPaginatedResponse<PublicEntitySummary>;
};
