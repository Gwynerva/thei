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
  /** The day of a diary entry, which stands in for the title it lacks. */
  date?: string;
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
 * How many related entities of each kind a visitor may see.
 *
 * A page carries only the counts: the lists themselves come one kind and one
 * page at a time, because a project may gather hundreds of diary entries. A
 * diary entry the visitor cannot open is not counted, so the count never
 * says more than the list would.
 */
export type PublicRelatedCounts = Partial<Record<RelationEntityType, number>>;

/** One page of one kind of related entity, in the order the block shows. */
export type PublicRelatedPage = PublicPaginatedResponse<PublicEntityLink>;

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

/** A stage, section or diary entry beside the one on the page. */
export type PublicNeighbour = {
  title: string;
  href: string;
  media?: MediaDescriptor;
  /** The day of a diary entry, shown in place of the title it lacks. */
  date?: string;
};

/**
 * The ones just before and just after, in the order a reader goes through
 * them: stages and diary entries by time, sections as the project sorts them.
 * Only what the viewer could open, and only when there is one.
 */
export type PublicNeighbours = {
  previous?: PublicNeighbour;
  next?: PublicNeighbour;
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
  /** `updatedAt` only when the stage was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
  project: PublicProjectChildParent;
  references: PublicReferences;
  /** Set by the page's own route; the Markdown representation has none. */
  neighbours?: PublicNeighbours;
};

export type PublicProjectSectionResponse = PublicProjectSection & {
  humanReadableSlug: string;
  publicId: string;
  content: PublicContentOutputData;
  /** `updatedAt` only when the section was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
  project: PublicProjectChildParent;
  references: PublicReferences;
  /** Set by the page's own route; the Markdown representation has none. */
  neighbours?: PublicNeighbours;
};

export type PublicProjectResponse = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  chronology: {
    createdAt: string;
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
  related: PublicRelatedCounts;
  /** The newest status, if the project keeps any; `statusCount` counts them. */
  currentStatus?: StatusHistoryItem;
  statusCount: number;
  /**
   * The newest points of the project's own chronology, for the overview tab;
   * `total` is the counter on the "Chronology" tab.
   */
  timeline: { latest: LifePoint[]; total: number };
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
  /** `updatedAt` only when the event was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
  content: PublicContentOutputData;
  references: PublicReferences;
  tags: PublicTagSummary[];
  related: PublicRelatedCounts;
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
  /**
   * When the entry was written and last changed, which need not be its day.
   * `updatedAt` only when it was edited on a later day than it was written.
   */
  chronology: { createdAt: string; updatedAt?: string };
  content: PublicContentOutputData;
  references: PublicReferences;
  related: PublicRelatedCounts;
  /** Set by the page's own route; the Markdown representation has none. */
  neighbours?: PublicNeighbours;
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
