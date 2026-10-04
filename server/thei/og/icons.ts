import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { IconSymbol } from '#layers/thei/shared/icon-svg';
import { iconSymbols } from '#thei/icon-symbols';
import type { OgEntityKind, OgServiceId } from './model';
import { el, type OgNode } from './render';

/**
 * The icons a card is drawn with: the site's own, by the names the interface
 * uses, from the symbols bundled at build time — nothing is read from disk.
 */
export const OG_KIND_ICONS: Record<OgEntityKind, string> = {
  project: entityTypeIcon('project'),
  section: entityTypeIcon('project-section'),
  event: entityTypeIcon('event'),
  diary: entityTypeIcon('diary-entry'),
  page: entityTypeIcon('page'),
  tag: entityTypeIcon('tag'),
};

export const OG_SERVICE_ICONS: Record<OgServiceId, string> = {
  life: 'heart',
  diary: entityTypeIcon('diary-entry'),
  rewind: 'history',
  search: 'search',
  projects: entityTypeIcon('project'),
  events: entityTypeIcon('event'),
  showcase: 'star',
  cv: 'case-important',
  tags: entityTypeIcon('tag'),
  pages: entityTypeIcon('page'),
};

/** Icons a card's facts are marked with. */
export const OG_META_ICONS = {
  period: 'calendar',
  updated: 'history',
  sections: entityTypeIcon('project-section'),
  projects: entityTypeIcon('project'),
  events: entityTypeIcon('event'),
  diary: entityTypeIcon('diary-entry'),
  tags: entityTypeIcon('tag'),
  approximate: 'approximate',
  domain: 'globe',
  status: 'pulse',
  person: 'person',
  showcase: 'star',
  cv: 'case-important',
} as const;

const symbols: Partial<Record<string, IconSymbol>> = iconSymbols;

/**
 * One icon as an SVG picture in one colour, drawn the way the generated
 * icons draw their glyph: an unpainted shape takes the group's fill, and
 * `currentColor` becomes that fill too.
 */
export function ogIconSvg(name: string, color: string): string | undefined {
  const symbol = symbols[name];
  if (!symbol) return undefined;
  const body = symbol.body.replaceAll('currentColor', color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox}"><g fill="${color}">${body}</g></svg>`;
}

export function ogIconDataUri(name: string, color: string) {
  const svg = ogIconSvg(name, color);
  return svg
    ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    : undefined;
}

/**
 * An icon fitted into a square of `size`, keeping its own proportions, or an
 * empty square of the same size when the name is unknown — a layout never
 * shifts because an icon is missing.
 */
export function ogIcon(
  name: string,
  color: string,
  size: number,
  style: Record<string, unknown> = {},
): OgNode {
  const symbol = symbols[name];
  const src = ogIconDataUri(name, color);
  if (!symbol || !src)
    return el('div', {
      style: { display: 'flex', width: size, height: size, ...style },
    });
  const [, , boxWidth = 24, boxHeight = 24] = symbol.viewBox
    .split(/[\s,]+/)
    .map(Number);
  const scale = size / Math.max(boxWidth, boxHeight);
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      },
    },
    el('img', {
      src,
      width: Math.round(boxWidth * scale),
      height: Math.round(boxHeight * scale),
    }),
  );
}
