import type { PublicTagSummary } from '../api/public';
import type { MediaDescriptor } from '../media';
import type { SearchSegment } from './snippet';

/**
 * What one search answers, the same for the search page, the quick search,
 * MCP and the site's own model: kinds, the entities found of each, and for
 * each entity where in it the words were found.
 */
export const SEARCH_KINDS = [
  'project',
  'event',
  'diary-entry',
  'page',
  'file',
  'tag',
  'profile',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Entities on a page of one kind, or of the catalogue. */
export const SEARCH_PAGE_SIZE = 20;

/** Where in an entity something was found. */
export type SearchFindWhere =
  | 'title'
  | 'name'
  | 'summary'
  | 'heading'
  | 'text'
  | 'caption'
  | 'file'
  | 'hint'
  | 'link'
  | 'relation'
  | 'period'
  | 'status'
  | 'fact'
  | 'notes'
  | 'place'
  | 'tag'
  | 'day';

export interface SearchFind {
  where: SearchFindWhere;
  /** What the place is called: a section's title, a related entity's, a day. */
  label?: string;
  /** Straight to the place: its page, its block, the words. */
  href: string;
  /** The words around the find, those found marked; none for another name. */
  segments: SearchSegment[];
  /** A file's preview, beside a find in a file. */
  media?: MediaDescriptor;
  /** For the owner: the ids of the place — a section, a block, a file. */
  place?: { section?: string; block?: string; file?: string };
}

export interface SearchHit {
  kind: SearchKind;
  /** `project:<uuid>`, `diary-entry:<uuid>`, `file:<family>`… */
  ref: string;
  title: string;
  href: string;
  /** For the owner: where it is edited. */
  editHref?: string;
  /** The day it stands on, or its last day. */
  date?: string;
  /** A period it covers, when it has one. */
  period?: { startDate: string; endDate: string };
  summary?: string;
  /** What stands for it on its cards, or a file's own preview. */
  media?: MediaDescriptor;
  /** Of a file: which one, of what kind and size. */
  file?: { assetUuid: string; type: string; extension: string; size: number };
  showcase?: boolean;
  cv?: boolean;
  /** Only the owner learns it: who else may see it. */
  access?: 'link-only' | 'private';
  /** Only the owner reads it: what the entity waits for. */
  reminder?: string;
  finds: SearchFind[];
  /** Finds beyond those given. */
  more: number;
}

export interface SearchGroup {
  kind: SearchKind;
  total: number;
  hits: SearchHit[];
}

/** A part of the admin the quick search goes to by its name. */
export const SEARCH_ADMIN_SECTIONS = [
  'projects',
  'events',
  'diary',
  'pages',
  'tags',
  'files',
  'profile',
  'settings',
  'updates',
  'ai',
] as const;
export type SearchAdminSection = (typeof SEARCH_ADMIN_SECTIONS)[number];

/**
 * Something the owner may do from the quick search, as data: the page puts it
 * into words. Few on purpose — what an archive is kept with every day, made
 * as cheap as it can be; whatever is rare or cannot be undone stays in its
 * form.
 */
export type SearchAction =
  /** The diary of a day: open its entry, or begin it. */
  | { type: 'diary'; date: string; today: boolean; exists: boolean; href: string }
  /** The entity the owner is looking at, in its editor or on the site. */
  | { type: 'edit' | 'view'; kind: SearchKind; title: string; href: string }
  /** What the owner saved last. */
  | {
      type: 'recent';
      kind: SearchKind;
      title: string;
      href: string;
      updatedAt: number;
      media?: MediaDescriptor;
      access?: 'link-only' | 'private';
    }
  | { type: 'section'; section: SearchAdminSection; href: string }
  /** A new entity, named by the query. */
  | { type: 'create'; kind: 'project' | 'event' | 'page'; title: string; href: string }
  /** The query, asked of the site's model. */
  | { type: 'ask-ai'; text: string };

export interface SearchFacets {
  kinds: Partial<Record<SearchKind, number>>;
  years: { year: number; count: number }[];
  tags: { tag: PublicTagSummary; count: number; state?: 'include' | 'exclude' }[];
}

export interface SearchResponse {
  /** The query as read. */
  query: string;
  /**
   * Nothing was found as typed, and this — the query on the other keyboard —
   * is what the hits are for.
   */
  keyboard?: string;
  /**
   * Not every word was found together: the hits hold at least one of them,
   * those holding more first.
   */
  partial?: boolean;
  total: number;
  groups: SearchGroup[];
  facets: SearchFacets;
  page: number;
  pageCount: number;
  /** The index is still being built: how far. */
  building?: { done: number; total: number };
  /** For the owner, in the quick search. */
  actions?: SearchAction[];
}
