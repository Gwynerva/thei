import { cyrb53 } from '#layers/thei/shared/utils/hash';
import type { OgArtworkAnalysis } from './artwork';
import type { OgCardContent } from './model';
import type { OgTone } from './palette';

/**
 * Which layout a card takes and in which tone — decided by what the card
 * shows, never by hand.
 *
 * Every kind of thing has one layout of its own, built around the shape of
 * its picture, and no two kinds look alike: a project is its page's header,
 * its icon beside the title and its banner behind; a stage, a section or an
 * event gives the right half of the card to its first picture; a diary
 * entry is a calendar leaf; a page holds up its icon; a tag stands centred
 * under its own. Their tones are fixed as well, so a kind always reads as
 * itself. Only the site's own pages — the chronology, the search, the
 * directories — still take one of a few tones by chance, seeded by the site,
 * for variety among its links.
 */
export type OgLayoutName =
  | 'project'
  | 'media'
  | 'calendar'
  | 'page'
  | 'tag'
  | 'poster'
  | 'home'
  | 'life'
  | 'tags'
  | 'collection';

export const OG_LAYOUT_NAMES: OgLayoutName[] = [
  'project',
  'media',
  'calendar',
  'page',
  'tag',
  'poster',
  'home',
  'life',
  'tags',
  'collection',
];

export interface OgDesign {
  layout: OgLayoutName;
  tone: OgTone;
  /** Which neighbouring hue a duotone runs to. */
  duotoneDirection: 1 | -1;
}

/**
 * The tones each layout may take. A project, a stage, a section and an event
 * are dark, as a project's header is; a page and a tag are a field of their
 * icon's colour; a calendar leaf takes the shade its picture calls for.
 */
export const OG_LAYOUT_TONES: Record<OgLayoutName, OgTone[]> = {
  project: ['night'],
  media: ['night'],
  calendar: ['paper', 'night'],
  page: ['duotone'],
  tag: ['vivid'],
  poster: ['vivid', 'duotone'],
  home: ['night', 'vivid', 'duotone'],
  life: ['night', 'paper'],
  tags: ['night', 'paper'],
  collection: ['night', 'paper', 'duotone'],
};

/** Below this chroma an accent is a grey, and a coloured field would lie. */
const NEUTRAL_CHROMA = 0.04;

/** Darker than this, a photograph is pinned to a dark leaf, not a light one. */
const DARK_PICTURE = 0.5;

export function chooseLayout(
  content: OgCardContent,
  tiles: number,
): OgLayoutName {
  switch (content.kind) {
    case 'site':
      return 'home';
    case 'service:life':
    case 'service:diary':
      return content.histogram?.values.some(Boolean) ? 'life' : 'poster';
    case 'service:tags':
      return content.cloud.length ? 'tags' : 'poster';
    case 'service:rewind':
      return 'poster';
    case 'service:search':
    case 'service:projects':
    case 'service:events':
    case 'service:showcase':
    case 'service:cv':
    case 'service:pages':
      return tiles >= 2 ? 'collection' : 'poster';
    case 'project':
      return 'project';
    case 'stage':
    case 'section':
    case 'event':
      return 'media';
    case 'diary':
      return 'calendar';
    case 'page':
      return 'page';
    case 'tag':
      return 'tag';
  }
}

export function allowedTones(
  layout: OgLayoutName,
  content: OgCardContent,
  picture: OgArtworkAnalysis | undefined,
): OgTone[] {
  if (layout === 'calendar')
    return [picture && picture.lightness < DARK_PICTURE ? 'night' : 'paper'];
  let tones = OG_LAYOUT_TONES[layout];
  if (content.accent.chroma < NEUTRAL_CHROMA) {
    tones = tones.filter((tone) => tone === 'night' || tone === 'paper');
    if (!tones.length) tones = ['night'];
  }
  return tones;
}

export function chooseDesign(
  content: OgCardContent,
  picture: OgArtworkAnalysis | undefined,
  tiles: number,
  override: Partial<OgDesign> = {},
): OgDesign {
  const layout = override.layout ?? chooseLayout(content, tiles);
  const tones = allowedTones(layout, content, picture);
  const tone =
    override.tone ??
    tones[cyrb53(`tone:${layout}:${content.seed}`) % tones.length]!;
  return {
    layout,
    tone,
    duotoneDirection:
      override.duotoneDirection ??
      (cyrb53(`duotone:${content.seed}`) % 2 ? 1 : -1),
  };
}
