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
import type { PublicSearchFilters } from '../public-search';

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

/**
 * Stand-in for an entity, a file or a media item a visitor may not see.
 *
 * It carries a codename and a generated icon and nothing else: no href, no
 * summary, no tags, no bytes or properties of the hidden thing itself.
 */
export type PublicSecretReference = {
  secret: true;
  key: string;
  title: string;
  /** A stock line about secrecy, never the hidden thing's own summary. */
  summary: string;
  iconMedia: MediaDescriptor;
  relationType?: ProjectRelationType;
};

export type PublicProjectLink = PublicProjectReference | PublicSecretReference;

export function isPublicSecret(value: object): value is PublicSecretReference {
  return 'secret' in value && value.secret === true;
}

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
  cv?: boolean;
  relatedProjects?: PublicProjectLink[];
};

export type PublicSearchTagFacet = {
  tag: PublicTagSummary;
  /** Results in the current search that carry the tag. */
  count: number;
  state?: 'include' | 'exclude';
};

export type PublicSearchResponse =
  PublicPaginatedResponse<PublicEntitySummary> & {
    filters: PublicSearchFilters;
    tags: PublicSearchTagFacet[];
    /** Matches by type across every page. */
    totals: { project: number; event: number };
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
  files: (PublicFile | PublicSecretReference)[];
};

/**
 * One kind of reference, split by where it was added. `shared` holds what was
 * both attached by hand and mentioned in the content.
 */
export type PublicReferenceSplit<T> = {
  shared: T[];
  manual: T[];
  content: T[];
};

export type PublicReferences = {
  links: PublicReferenceSplit<PublicReferenceLink>;
  files: PublicReferenceSplit<PublicFile | PublicSecretReference>;
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
  references: PublicReferences;
};

export type PublicProjectSectionResponse = PublicProjectSection & {
  humanReadableSlug: string;
  publicId: string;
  content: PublicContentOutputData;
  project: PublicProjectChildParent;
  references: PublicReferences;
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
    updatedAt?: string;
  };
  isShowcase: boolean;
  isCv: boolean;
  iconMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  description?: PublicContentOutputData;
  stages: PublicProjectStage[];
  sections: PublicProjectSection[];
  showcase: (PublicAssetDescriptor | PublicSecretReference)[];
  files: (PublicFile | PublicSecretReference)[];
  tags: PublicTagSummary[];
  relatedProjects: PublicProjectLink[];
  /** The latest related events; `total` counts all of them. */
  relatedEvents: { items: PublicEntitySummary[]; total: number };
  references: PublicReferences;
  action?: PublicAction;
};

export type PublicProjectEventsResponse =
  PublicPaginatedResponse<PublicEntitySummary> & {
    project: PublicProjectChildParent;
  };

export type PublicEventResponseFull = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  periods: DateRange[];
  content: PublicContentOutputData;
  references: PublicReferences;
  tags: PublicTagSummary[];
  relatedProjects: PublicProjectLink[];
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
