import type { ProjectEventAccessLevel } from '../access-level';
import type { PublicContentOutputData } from '../content';
import type { ContentEntityType } from '../content-link';
import type { DatedPeriod } from '../date-precision';
import type {
  ProjectActionBackgroundMode,
  ProjectActionBackgroundRepeat,
  ProjectActionBackgroundSize,
  ProjectActionTarget,
} from '../project-action';
import type { MediaDescriptor } from '../media';
import type { ArchivedOriginalFileMeta } from '../asset';
import type { RelationEntityType, RelationType } from '../relation';
import type { PublicSearchFilters } from '../public-search';
import type { StatusHistoryItem } from '../status';
import type { LifePoint } from '../life';

export type PublicTagSummary = {
  title: string;
  slug: string;
  publicId: string;
  description?: string;
  iconMedia?: MediaDescriptor;
};

export type PublicEntityReference = {
  /** Which kind of thing this is, for the badge on its tile. */
  entityType: RelationEntityType;
  title: string;
  summary: string;
  href: string;
  iconMedia?: MediaDescriptor;
  relationType?: RelationType;
  /** Why this is related, as written for the page it is shown on. */
  note?: string;
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
  relationType?: RelationType;
  /**
   * Which kind of thing is hidden.
   *
   * Saying "a project you cannot see" rather than "something you cannot see"
   * gives the reader their bearings without giving the thing itself away.
   */
  entityType?: RelationEntityType;
};

export type PublicEntityLink = PublicEntityReference | PublicSecretReference;

/**
 * A diary entry as something else's page lists it.
 *
 * There is no title to show, so the day is the label and the opening of the
 * text is the description. Entries a visitor may not open are left out of
 * these lists entirely rather than replaced by a codename: a diary is allowed
 * to keep quiet about how much of it there is.
 */
export type PublicDiaryLink = {
  date: string;
  href: string;
  /** The opening of the entry, which stands in for a summary. */
  excerpt: string;
  /** Owner only: set when the entry is not public. */
  access?: ProjectEventAccessLevel;
};

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
  relatedEntities?: PublicEntityLink[];
  /** Owner only: the reminder that marks this entity wherever it is listed. */
  reminder?: string;
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
  kind: 'external' | ContentEntityType;
  title: string;
  /** The day of a diary entry, shown in place of the title it lacks. */
  date?: string;
  href: string;
  description?: string;
  iconMedia?: MediaDescriptor;
  relationType?: RelationType;
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
  period: DatedPeriod;
  periods: DatedPeriod[];
  media?: MediaDescriptor;
};

export type PublicProjectSection = {
  title: string;
  summary: string;
  href: string;
  date: string;
  media?: MediaDescriptor;
};

export type PublicProjectChildParent = PublicEntityReference & {
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
  /** `updatedAt` only when the section was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
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
    /** When the project's oldest status was set. */
    firstStatusAt?: string;
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
  relatedEntities: PublicEntityLink[];
  /** The newest status, if the project keeps any; `statusCount` counts them. */
  currentStatus?: StatusHistoryItem;
  statusCount: number;
  /**
   * The newest points of the project's own chronology, for the overview tab;
   * `total` is the counter on the "Chronology" tab.
   */
  timeline: { latest: LifePoint[]; total: number };
  /** Diary entries tied to this project, newest first. */
  diaryEntries: PublicDiaryLink[];
  references: PublicReferences;
  action?: PublicAction;
  /**
   * Owner only. A visitor never receives either field — not here, not in the
   * Markdown representation, not in search.
   */
  reminder?: string;
  notes?: PublicContentOutputData;
};

export type PublicEventResponseFull = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  periods: DatedPeriod[];
  content: PublicContentOutputData;
  references: PublicReferences;
  tags: PublicTagSummary[];
  relatedEntities: PublicEntityLink[];
  /** Diary entries tied to this event, newest first. */
  diaryEntries: PublicDiaryLink[];
  action?: PublicAction;
  /**
   * Owner only. A visitor never receives either field — not here, not in the
   * Markdown representation, not in search.
   */
  reminder?: string;
  notes?: PublicContentOutputData;
};

/** One diary entry's own page. */
export type PublicDiaryResponse = {
  date: string;
  access: ProjectEventAccessLevel;
  content: PublicContentOutputData;
  references: PublicReferences;
  relatedEntities: PublicEntityLink[];
  /** Owner only. */
  reminder?: string;
  /** Owner only. */
  notes?: PublicContentOutputData;
};

export type PublicTagListItem = PublicTagSummary & {
  projectCount: number;
  eventCount: number;
};

export type PublicTagResponse = PublicTagListItem & {
  activeTab: 'projects' | 'events';
  items: PublicPaginatedResponse<PublicEntitySummary>;
};
