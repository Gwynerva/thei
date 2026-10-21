// The archive as FORMAT.md describes it, read into memory: what each file
// says, still in the archive's own words — refs, file ids, Lab Markdown.
import type { Access } from '../types';

/** Where something was read from, for messages: `events/2019/fair.md`. */
export interface Source {
  file: string;
}

export interface ArchiveMeta {
  format: number;
  revision: number;
  version: string;
  title: string;
  language: string;
  span: { start: string; end: string };
}

/** A date as written: `2019-05-04`, `today`, `today+3`, `today-1`. */
export type ArchiveDate = string;

export interface ArchivePeriod {
  start: ArchiveDate;
  end: ArchiveDate;
  precision: 'exact' | 'day' | 'month' | 'year';
  doubt: string;
  label: string;
}

export interface ArchiveStatus {
  date: ArchiveDate;
  text: string;
  file?: string;
  empty: boolean;
}

export type RelationKind = 'related' | 'depends-on' | 'affects';

export interface ArchiveRelation {
  to: string;
  kind: RelationKind;
  note?: string;
  notes?: { this: string; other: string };
}

export interface ArchiveLink {
  url: string;
  note: string;
  private: boolean;
}

export interface ArchiveNamedLink extends ArchiveLink {
  name: string;
}

export interface ArchiveFilePlacement {
  file: string;
  title?: string;
  caption: string;
  private: boolean;
}

export interface ArchiveAction {
  text: string;
  link?: string;
  file?: string;
  color?: string;
  private: boolean;
  /** Absent: the default icon. */
  icon?: 'favicon' | { file: string };
  background: 'standard' | 'auto' | 'accent' | { file: string };
  size: 'natural' | 'contain' | 'cover' | 'stretch';
  repeat: 'no-repeat' | 'repeat-x' | 'repeat-y' | 'repeat';
}

export interface ArchivePerson extends Source {
  name: string;
  nickname: string;
  birthDate: string;
  slogan: string;
  avatars: string[];
  banner?: string;
  favicon?: string;
  facts: { name: string; value: string }[];
  links: ArchiveNamedLink[];
  pinned: string[];
  statuses: ArchiveStatus[];
  about: string;
}

export interface ArchiveTag extends Source {
  id: string;
  title: string;
  slug?: string;
  synonyms: string[];
  icon?: string;
  description: string;
}

export interface ArchivePage extends Source {
  id: string;
  title: string;
  summary: string;
  slug: string;
  access: Access;
  icon?: string;
  synonyms: string[];
  reminder: string;
  notes: string;
  body: string;
}

export interface ArchiveSection extends Source {
  id: string;
  project: string;
  /** The owner's order of the project's sections. */
  order: number;
  title: string;
  summary: string;
  slug?: string;
  private: boolean;
  periods: ArchivePeriod[];
  banner?: string;
  body: string;
}

export interface ArchiveProject extends Source {
  id: string;
  title: string;
  summary: string;
  slug?: string;
  access: Access;
  featured: boolean;
  cv: boolean;
  icon?: string;
  banner?: string;
  tags: string[];
  synonyms: string[];
  reminder: string;
  notes: string;
  links: ArchiveLink[];
  files: ArchiveFilePlacement[];
  showcase: ArchiveFilePlacement[];
  statuses: ArchiveStatus[];
  action?: ArchiveAction;
  relations: ArchiveRelation[];
  body: string;
  sections: ArchiveSection[];
}

export interface ArchiveEvent extends Source {
  id: string;
  /** The year folder it was found in. */
  year: string;
  title: string;
  summary: string;
  slug?: string;
  access: Access;
  periods: ArchivePeriod[];
  banner?: string;
  tags: string[];
  synonyms: string[];
  reminder: string;
  notes: string;
  links: ArchiveLink[];
  files: ArchiveFilePlacement[];
  action?: ArchiveAction;
  relations: ArchiveRelation[];
  body: string;
}

export interface ArchiveDiaryEntry extends Source {
  /** `2019-03-04`, or `today+1` for an entry under `diary/relative/`. */
  date: ArchiveDate;
  access: Access;
  reminder: string;
  notes: string;
  relations: ArchiveRelation[];
  body: string;
}

export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'other';

export interface ArchiveFile extends Source {
  id: string;
  kind: FileKind;
  ext: string;
  title: string;
  description: string;
  origin?: 'commons' | 'generated' | 'original';
  source?: { page?: string; download?: string; retrieved?: string };
  author: string;
  licence: string;
  licenceUrl?: string;
  attribution?: string;
  transform?: string;
  people?: 'none' | 'incidental';
  truth?: string;
}

export interface ArchivePlant {
  id: string;
  ref?: string;
  file?: string;
  traits: string[];
  where?: string;
  word?: string;
  detail?: string;
}

export interface Archive {
  dir: string;
  meta: ArchiveMeta;
  person?: ArchivePerson;
  tags: ArchiveTag[];
  pages: ArchivePage[];
  projects: ArchiveProject[];
  events: ArchiveEvent[];
  diary: ArchiveDiaryEntry[];
  files: ArchiveFile[];
  plants: ArchivePlant[];
}

/** What a reader or a check found wrong, or worth saying. */
export interface ArchiveIssue {
  level: 'error' | 'warning';
  file: string;
  message: string;
}
