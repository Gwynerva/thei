import type { ImageAccent } from '#layers/thei/shared/accent-color';
import type { GeneratedIconKind } from '../media/generated-icon';

/**
 * What a card says, as plain words, numbers and pictures.
 *
 * This is the one shape between the database and the drawing. Resolving it
 * reads content as a stranger would see it and formats every word; drawing
 * it knows nothing about projects or diaries, only about chips, a headline,
 * rows of facts and pictures. Every string in it is already drawable — the
 * card's fonts cover it (see `text.ts`) — and the headline is never empty.
 */
export type OgServiceId =
  | 'life'
  | 'diary'
  | 'rewind'
  | 'search'
  | 'projects'
  | 'events'
  | 'showcase'
  | 'cv'
  | 'tags'
  | 'pages';

export type OgEntityKind =
  'project' | 'stage' | 'section' | 'event' | 'diary' | 'page' | 'tag';

export type OgCardKind = 'site' | OgEntityKind | `service:${OgServiceId}`;

/**
 * A picture a card can draw: a stored file, or the drawn icon the site shows
 * for a thing without a picture of its own.
 */
export type OgPicture =
  | {
      type: 'file';
      /**
       * What the picture is, independent of where it lives: the stored file's
       * content hash and extension. A card's version is signed with this.
       */
      key: string;
      file: string;
      width?: number;
      height?: number;
      accent?: ImageAccent;
    }
  | { type: 'generated'; kind: GeneratedIconKind; hue: number };

/** A Thei icon by name, and a label. */
export interface OgChip {
  icon: string;
  label: string;
}

export interface OgMeta {
  icon: string;
  text: string;
}

export interface OgTag {
  title: string;
  accent: ImageAccent;
  picture?: OgPicture;
  count?: number;
}

export interface OgStat {
  icon: string;
  value: string;
  label: string;
}

/** A diary entry's day as a calendar leaf shows it. */
export interface OgDate {
  weekday: string;
  day: string;
  month: string;
  year: string;
}

export interface OgSite {
  name: string;
  domain?: string;
  /** An uploaded favicon; without one the card draws the Thei mark. */
  favicon?: OgPicture;
}

export interface OgCardContent {
  kind: OgCardKind;
  /** A stable identity: the choices a card makes by chance are seeded by it. */
  seed: string;
  accent: ImageAccent;
  /** The kind first, then badges such as "In showcase". */
  chips: OgChip[];
  /** What a stage or a section belongs to. */
  parent?: { title: string; picture?: OgPicture };
  headline: string;
  summary?: string;
  /** The opening words of a diary entry. */
  quote?: string;
  /** A project's current status. */
  status?: string;
  /** Facts, most important first. */
  meta: OgMeta[];
  /** The projects an event or an entry belongs to. */
  related?: { icon: string; titles: string[]; total: number };
  tags: string[];
  tagsTotal: number;
  /**
   * What the thing is shown by: a project's, a page's or a tag's icon, the
   * first picture of a stage, a section, an event or an entry, an avatar.
   */
  picture?: OgPicture;
  /** A project's banner, drawn behind it the way its page's header does. */
  banner?: OgPicture;
  /** Pictures of what a collection opens with: search presets, pages. */
  tiles: OgPicture[];
  tilesTotal: number;
  stats: OgStat[];
  histogram?: { values: number[]; first: string; last: string };
  cloud: OgTag[];
  cloudTotal: number;
  date?: OgDate;
  site: OgSite;
  alt: string;
}

/** A card with nothing but a headline, to build others from. */
export function emptyOgContent(
  kind: OgCardKind,
  seed: string,
  headline: string,
  site: OgSite,
  accent: ImageAccent,
): OgCardContent {
  return {
    kind,
    seed,
    accent,
    chips: [],
    headline,
    meta: [],
    tags: [],
    tagsTotal: 0,
    tiles: [],
    tilesTotal: 0,
    stats: [],
    cloud: [],
    cloudTotal: 0,
    site,
    alt: headline,
  };
}
