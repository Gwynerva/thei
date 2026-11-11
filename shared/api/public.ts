import type { ProjectEventAccessLevel } from '../access-level';
import type { PublicContentOutputData } from '../content';
import type { ContentEntityParent, ContentEntityType } from '../content-link';
import type { DatedPeriod } from '../date-precision';
import type { Period } from '../period';
import type {
  ProjectActionBackgroundMode,
  ProjectActionBackgroundRepeat,
  ProjectActionBackgroundSize,
  ProjectActionTarget,
} from '../project-action';
import type { MediaDescriptor } from '../media';
import type { ArchivedOriginalFileMeta, AssetRole } from '../asset';
import type {
  RelationEntityType,
  RelationTargetType,
  RelationType,
} from '../relation';
import type { StatusHistoryItem } from '../status';
import type { ExcerptParentType } from '../excerpt';
import type { PaginatedResponse } from '../pagination';

export type PublicTagSummary = {
  title: string;
  slug: string;
  publicId: string;
  description?: string;
  iconMedia?: MediaDescriptor;
};

export type PublicEntityReference = {
  /** Which kind of thing this is, for the badge on its tile. */
  entityType: RelationTargetType;
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
  entityType?: RelationTargetType;
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
export type PublicRelatedPage = PaginatedResponse<PublicEntityLink>;

/**
 * The entity an excerpt is a part of, as the excerpt's page and cards name
 * it: a diary entry by its day, an event or a project by its title, each
 * with what stands for it on a card.
 */
export type PublicExcerptParent = {
  type: ExcerptParentType;
  /** Empty for a diary entry, which is called by its `date`. */
  title: string;
  /** What its card says under its name: a diary entry, its opening words. */
  summary: string;
  href: string;
  /** The day of a diary entry. */
  date?: string;
  access: ProjectEventAccessLevel;
  media?: MediaDescriptor;
};

/**
 * An excerpt as a card shows it: on the page of what it is about, in a
 * list, in the sidebar of its parent. `about` names what it is about, as
 * the visitor may see it; on the page of one of those, `relationType` and
 * `note` say how it relates to that page.
 */
export type PublicExcerptCard = {
  title: string;
  summary: string;
  href: string;
  publicId: string;
  /** What stands for it on a card: its banner, its first picture, or its icon. */
  media: MediaDescriptor;
  parent: PublicExcerptParent;
  /**
   * The day it is dated by, its parent's: a diary entry's day, the last day
   * of an event that has come. Absent for an excerpt of a project, which has
   * no day of its own.
   */
  date?: string;
  about: PublicEntityLink[];
  relationType?: RelationType;
  /** Why it is about this page, as written for this side. */
  note?: string;
};

/** An excerpt whole: on its parent's page, and on its own. */
export type PublicExcerpt = PublicExcerptCard & {
  humanReadableSlug: string;
  /** The picture the page opens with, when the excerpt has one. */
  bannerMedia?: MediaDescriptor;
  content: PublicContentOutputData;
  /** `updatedAt` only when the excerpt was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
};

/**
 * An excerpt of a page's entity the visitor may not read — private, or
 * about something closed to them — kept in its place among the ones they
 * may, under its codename and what it is about. Only its parent's side
 * shows it: the page of
 * what it is about and the search leave it out.
 */
export type PublicExcerptSecret = {
  key: string;
  title: string;
  /** The words a secret is given with its codename, as any secret's are. */
  summary: string;
  iconMedia: MediaDescriptor;
  /**
   * What it is about, as far as this visitor may know: the entity, or its
   * codename; none for a diary entry closed to them, or a subject deleted.
   */
  about: PublicEntityLink[];
  /** How many of the excerpts the visitor may read stand before it. */
  before: number;
};

export type PublicExcerptResponse = PublicExcerpt & {
  /** Set by the page's own route; the Markdown representation has none. */
  neighbours?: PublicNeighbours;
};

/** One page of the excerpts about an entity, newest first. */
export type PublicExcerptsPage = PaginatedResponse<PublicExcerptCard>;

/**
 * How many excerpts are about an entity, as the visitor may see them. The
 * page carries the count; the cards come a page at a time.
 */
export type PublicExcerptsAbout = { total: number };

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
  /** The day a card is dated by: an event's last day, a project's first. */
  date: string;
  /** The stretch an event's periods cover, as sure as the owner is of it. */
  period?: DatedPeriod;
  showcase?: boolean;
  cv?: boolean;
  relatedEntities?: PublicEntityLink[];
  /** Owner only: the reminder that marks this entity wherever it is listed. */
  reminder?: string;
};

export type PublicAssetDescriptor = {
  key: string;
  title: string;
  /** The caption of the place it is shown in, as plain text. */
  description?: string;
  /**
   * The caption a text gives the file, as the inline markup it is stored in;
   * shown with its marks, links and hints in place of `description`.
   */
  caption?: string;
  /**
   * The file's own description: what it shows or is about, the same
   * wherever it is placed. As typed; formatted where it is drawn.
   */
  alt?: string;
  href: string;
  extension: string;
  size: number;
  media?: MediaDescriptor;
  archivedOriginal?: ArchivedOriginalFileMeta;
};

export type PublicFile = PublicAssetDescriptor;

/** The pages a file's window may send a visitor on to. */
export type PublicFilePlaceKind = Extract<
  ContentEntityType,
  'project' | 'project-section' | 'excerpt' | 'event' | 'page' | 'diary-entry'
>;

/**
 * Another page a file is shown on, as a visitor's window of the file lists
 * it: a page anyone may find, where a stranger sees the file. Titles as
 * typed.
 */
export type PublicFilePlace = {
  kind: PublicFilePlaceKind;
  /** A diary entry's day, which is its title. */
  title: string;
  /** What the page says of itself, for its card: a summary, a lead, an opening. */
  summary: string;
  /** The page, at where it shows the file first (`shared/landing.ts`). */
  href: string;
  /** What stands for the page on a card: its icon, banner or first picture. */
  media?: MediaDescriptor;
  /** The project a section belongs to; the parent of an excerpt. */
  parent?: ContentEntityParent;
  /** How the file is shown there, each way once. */
  uses: AssetRole[];
};

export type PublicReferenceLink = {
  kind: 'external' | ContentEntityType;
  /**
   * What the target calls itself: an entity's title, or the linked page's own
   * title or hostname — the latter keep their own typography, and a hostname
   * none at all.
   */
  title: string;
  /** The day of a diary entry, shown in place of the title it lacks. */
  date?: string;
  href: string;
  description?: string;
  /**
   * The owner's word on why the link is there. It is shown under the
   * target's own title and description, never in place of them.
   */
  note?: string;
  iconMedia?: MediaDescriptor;
};

/**
 * The links and files the owner attached to a project or an event by hand,
 * as its sidebar lists them. What its text links to is read in the text.
 */
export type PublicReferences = {
  links: PublicReferenceLink[];
  files: (PublicFile | PublicSecretReference)[];
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

/**
 * A part of a project as its pages list it. A stage — a dated section —
 * carries its periods and the stretch they cover; a general one says no
 * date, since the day it was written says nothing of it.
 */
export type PublicProjectSection = {
  title: string;
  summary: string;
  href: string;
  /** The stretch the periods cover; absent for a general section. */
  period?: DatedPeriod;
  /** Empty for an undated section. */
  periods: Period[];
  /** What stands for the section in a card: its banner, its first picture, or its icon. */
  media?: MediaDescriptor;
};

/** A section or a diary entry beside the one on the page. */
export type PublicNeighbour = {
  title: string;
  href: string;
  media?: MediaDescriptor;
  /** The day of a diary entry, shown in place of the title it lacks. */
  date?: string;
  /** When a dated section was, shown under its title. */
  period?: DatedPeriod;
  /**
   * What an undated section is about, or how a diary entry begins, as the viewer may
   * read it.
   */
  summary?: string;
};

/**
 * The ones just before and just after, in the order a reader goes through
 * them: dated sections and diary entries by time, undated sections as the
 * project sorts them — each section among its own kind.
 * Only what the viewer could open, and only when there is one.
 */
export type PublicNeighbours = {
  previous?: PublicNeighbour;
  next?: PublicNeighbour;
};

export type PublicSectionParent = PublicEntityReference & {
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
};

export type PublicProjectSectionResponse = PublicProjectSection & {
  /** The picture the page opens with, when the section has one. */
  bannerMedia?: MediaDescriptor;
  humanReadableSlug: string;
  publicId: string;
  content: PublicContentOutputData;
  /** `updatedAt` only when the section was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
  project: PublicSectionParent;
  /** Set by the page's own route; the Markdown representation has none. */
  neighbours?: PublicNeighbours;
};

export type PublicProjectResponse = {
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  /** `updatedAt` only when the project was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
  isShowcase: boolean;
  isCv: boolean;
  iconMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  description?: PublicContentOutputData;
  /** The undated sections in the owner's order, then the dated ones, newest first. */
  sections: PublicProjectSection[];
  /** The project's own excerpts, whole, in the owner's order. */
  excerpts: PublicExcerpt[];
  /** Its excerpts the visitor may not read, as codenames in their places. */
  excerptSecrets: PublicExcerptSecret[];
  /** The excerpts of other entities about this project. */
  excerptsAbout: PublicExcerptsAbout;
  showcase: (PublicAssetDescriptor | PublicSecretReference)[];
  files: (PublicFile | PublicSecretReference)[];
  tags: PublicTagSummary[];
  related: PublicRelatedCounts;
  /** The newest status, if the project keeps any; `statusCount` counts them. */
  currentStatus?: StatusHistoryItem;
  statusCount: number;
  /** How many points the project's chronology tab holds, for its counter. */
  timeline: { total: number };
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
  periods: Period[];
  /** `updatedAt` only when the event was edited on a later day. */
  chronology: { createdAt: string; updatedAt?: string };
  /** What stands for the event in a card: its banner, its first picture, or its icon. */
  media: MediaDescriptor;
  /** The picture the page opens with, when the event has one. */
  bannerMedia?: MediaDescriptor;
  content: PublicContentOutputData;
  /** The event's own excerpts, whole, in the owner's order. */
  excerpts: PublicExcerpt[];
  /** Its excerpts the visitor may not read, as codenames in their places. */
  excerptSecrets: PublicExcerptSecret[];
  /** The excerpts of other entities about this event. */
  excerptsAbout: PublicExcerptsAbout;
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
  /** What stands for the entry in a card: its first picture, or its icon. */
  media: MediaDescriptor;
  content: PublicContentOutputData;
  /** The entry's own excerpts, whole, in the owner's order. */
  excerpts: PublicExcerpt[];
  /** Its excerpts the visitor may not read, as codenames in their places. */
  excerptSecrets: PublicExcerptSecret[];
  /** The excerpts of other entities about this entry. */
  excerptsAbout: PublicExcerptsAbout;
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
  items: PaginatedResponse<PublicEntitySummary>;
};
