import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { withAlpha } from '#layers/thei/shared/oklch';
import { analyzePicture, easedFadeStops, pictureDataUri } from './artwork';
import type { OgFitStep, OgStackItem, OgStackPlan } from './fit';
import { OG_FONT_FAMILY } from './font-set';
import { OG_HEIGHT, OG_WIDTH, ROW, TYPE, type OgBox } from './geometry';
import { ogIcon, OG_META_ICONS } from './icons';
import type {
  OgCardContent,
  OgChip,
  OgMeta,
  OgPicture,
  OgSite,
  OgStat,
} from './model';
import { vividPlate, type OgPalette, type OgPlate } from './palette';
import { el, type OgNode } from './render';
import type { OgStackPainter } from './stack';

/**
 * The pieces every layout is made of: the field, a chip, a fact with its
 * icon, a tag, the site's signature, the line naming a parent.
 *
 * A piece that holds owner-typed words ends them with an ellipsis when it
 * is given less room than they need, so no piece ever runs past its box.
 */

/** A label that ends in an ellipsis when its box is narrower than it. */
export function label(text: string, style: Record<string, unknown> = {}) {
  return el(
    'div',
    {
      style: {
        display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flexShrink: 1,
        minWidth: 0,
        ...style,
      },
    },
    text,
  );
}

/**
 * The card itself: its field, a glow of the accent where the layout wants
 * one, and the layout's pieces on top.
 */
export function frame(
  palette: OgPalette,
  glow: { x: number; y: number } | undefined,
  ...children: OgNode[]
): OgNode {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: OG_WIDTH,
        height: OG_HEIGHT,
        overflow: 'hidden',
        background: palette.background,
        color: palette.text,
        fontFamily: OG_FONT_FAMILY,
      },
    },
    ...(glow
      ? [
          el('div', {
            style: {
              display: 'flex',
              position: 'absolute',
              left: 0,
              top: 0,
              width: OG_WIDTH,
              height: OG_HEIGHT,
              backgroundImage: `radial-gradient(circle at ${glow.x}px ${glow.y}px, ${withAlpha(palette.glow.color, palette.glow.alpha)} 0%, ${withAlpha(palette.glow.color, 0)} 520px)`,
            },
          }),
        ]
      : []),
    ...children,
  );
}

export function chip(value: OgChip, plate: OgPlate): OgNode {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: ROW.chip,
        padding: '0 20px 0 16px',
        borderRadius: ROW.chip / 2,
        background: plate.background,
        color: plate.text,
        fontSize: TYPE.chip,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    ogIcon(value.icon, plate.text, 26),
    label(value.label),
  );
}

export function meta(value: OgMeta, palette: OgPalette, iconColor?: string) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: ROW.meta,
        color: palette.text,
        fontSize: TYPE.meta,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    ogIcon(value.icon, iconColor ?? palette.accent, 28),
    label(value.text),
  );
}

export function tagText(title: string, palette: OgPalette) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: ROW.tag,
        color: palette.muted,
        fontSize: TYPE.tag,
        whiteSpace: 'nowrap',
      },
    },
    label(`#${title}`),
  );
}

/** "+3": how many more there are than could be shown. */
export function plus(count: number, color: string, size: number = TYPE.tag) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        color,
        fontSize: size,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    `+${count}`,
  );
}

/** One of the things an event or an entry belongs to. */
export function related(icon: string, title: string, palette: OgPalette) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: ROW.related,
        color: palette.text,
        fontSize: TYPE.meta,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    ogIcon(icon, palette.accent, 28),
    label(title),
  );
}

/**
 * A small square picture for a line of text: a parent's icon, a favicon.
 * Pictures are always shown whole here, on a field of their own colour.
 */
export async function thumbnail(
  picture: OgPicture | undefined,
  size: number,
  radius: number,
): Promise<OgNode | undefined> {
  if (!picture) return undefined;
  const analysis = await analyzePicture(picture);
  if (!analysis) return undefined;
  const src = await pictureDataUri(picture, size * 2, size * 2, {
    fit: analysis.iconLike ? 'contain' : 'cover',
    alpha: analysis.transparent > 0,
  });
  if (!src) return undefined;
  return el('img', {
    src,
    width: size,
    height: size,
    style: { borderRadius: radius, flexShrink: 0 },
  });
}

/**
 * The site's mark: its uploaded favicon, or the Thei mark in the card's
 * text colour. A see-through favicon that would vanish on this field — a
 * dark logo on a dark card — sits on a small plate of the opposite shade.
 */
export async function favicon(
  site: OgSite,
  palette: OgPalette,
  size = ROW.signature,
): Promise<OgNode> {
  if (site.favicon) {
    const analysis = await analyzePicture(site.favicon);
    const picture = await thumbnail(site.favicon, size, Math.round(size / 4));
    if (picture && analysis) {
      const fades =
        analysis.transparent > 0.1 &&
        (palette.dark ? analysis.lightness < 0.55 : analysis.lightness > 0.6);
      if (!fades) return picture;
      const inner = await thumbnail(site.favicon, size - 8, 6);
      return el(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size,
            height: size,
            borderRadius: Math.round(size / 4),
            background: palette.text,
            flexShrink: 0,
          },
        },
        inner ?? picture,
      );
    }
  }
  return ogIcon('thei', palette.text, size);
}

/**
 * Who the card is from: the site's mark, its name and, where there is room
 * for it, its address.
 */
export async function signature(
  site: OgSite,
  palette: OgPalette,
  width: number,
  options: { domain?: boolean; shrink?: boolean } = {},
): Promise<OgNode> {
  return el(
    'div',
    {
      key: 'essential:signature',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        // Shrunk to its content, it can be pushed to the right of a row.
        ...(options.shrink ? { maxWidth: width } : { width }),
        height: ROW.signature,
        fontSize: TYPE.signature,
        whiteSpace: 'nowrap',
      },
    },
    await favicon(site, palette),
    label(site.name, {
      color: palette.text,
      fontWeight: 600,
      flexShrink: 0,
      maxWidth: width - 54,
    }),
    ...(options.domain !== false && site.domain
      ? [label(site.domain, { color: palette.muted })]
      : []),
  );
}

/** The line naming what a stage or a section belongs to. */
export async function parentLine(
  parent: NonNullable<OgCardContent['parent']>,
  palette: OgPalette,
  width: number,
): Promise<OgNode> {
  const picture = await thumbnail(parent.picture, 32, 8);
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width,
        height: ROW.parent,
        color: palette.muted,
        fontSize: TYPE.parent,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    picture ?? ogIcon('project', palette.muted, 30),
    label(parent.title),
  );
}

/** A number the archive holds: "18 projects", the figure bold. */
export function stat(value: OgStat, palette: OgPalette) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: ROW.stat,
        whiteSpace: 'nowrap',
      },
    },
    ogIcon(value.icon, palette.accent, 30),
    el(
      'div',
      {
        style: {
          display: 'flex',
          color: palette.text,
          fontSize: 32,
          fontWeight: 700,
        },
      },
      value.value,
    ),
    label(value.label, { color: palette.muted, fontSize: TYPE.meta }),
  );
}

export function statusLine(text: string, palette: OgPalette, width: number) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: width,
        height: ROW.status,
        padding: '0 18px',
        borderRadius: 14,
        background: palette.chip.background,
        color: palette.chip.text,
        fontSize: TYPE.status,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    ogIcon(OG_META_ICONS.status, palette.chip.text, 26),
    label(text),
  );
}

export interface OgColumnOptions {
  width: number;
  height: number;
  /** Title sizes, largest first. */
  sizes: number[];
  maxLines?: number;
  /** Leave the chips to the layout, which draws them elsewhere. */
  chips?: boolean;
  /** Draw the quote in place of the headline: a diary entry's leaf. */
  quote?: boolean;
  headline?: boolean;
  /** A picture on the headline's line, before it: a project's icon. */
  lead?: { node: OgNode; size: number; gap: number };
  /** A picture above everything else: a tag's icon. */
  crest?: { node: OgNode; height: number; gap: number };
  /** Line everything up down the middle of the column. */
  align?: 'start' | 'center';
}

/**
 * The text column most layouts share: chips, the parent line, the headline,
 * the summary or the quote, the status, facts, what it belongs to, tags —
 * each only when the content has it — and the ladder of what to give up,
 * in order, when there is more than the column holds.
 */
export async function column(
  content: OgCardContent,
  palette: OgPalette,
  options: OgColumnOptions,
): Promise<{ plan: OgStackPlan; painter: OgStackPainter }> {
  const items: OgStackItem[] = [];
  const blocks = new Map<string, OgNode>();

  if (options.crest) {
    blocks.set('crest', options.crest.node);
    items.push({
      kind: 'block',
      key: 'crest',
      height: options.crest.height,
      required: true,
      gapBefore: 0,
    });
  }

  if (options.chips !== false && content.chips.length)
    items.push({
      kind: 'row',
      key: 'chips',
      height: ROW.chip,
      gap: 12,
      items: content.chips.map((value, index) => ({
        key: `chip${index}`,
        node: chip(value, palette.chip),
        maxWidth: options.width,
      })),
      required: true,
      gapBefore: options.crest?.gap ?? 0,
    });

  if (content.parent) {
    blocks.set(
      'parent',
      await parentLine(content.parent, palette, options.width),
    );
    items.push({
      kind: 'block',
      key: 'parent',
      height: ROW.parent,
      gapBefore: 22,
    });
  }

  const showQuote = options.quote && content.quote;
  if (options.lead) blocks.set('lead', options.lead.node);
  if (options.headline !== false && !(showQuote && options.quote))
    items.push({
      kind: 'text',
      key: 'headline',
      text: content.headline,
      sizes: options.sizes,
      lineHeight: 1.08,
      weight: 700,
      maxLines: options.maxLines ?? 3,
      balance: true,
      keepWords: true,
      required: true,
      gapBefore: content.parent ? 12 : 24,
      ...(options.lead
        ? {
            lead: {
              key: 'lead',
              width: options.lead.size,
              height: options.lead.size,
              gap: options.lead.gap,
            },
          }
        : {}),
    });

  if (showQuote)
    items.push({
      kind: 'text',
      key: 'quote',
      text: `«${content.quote}»`,
      sizes: [...TYPE.quote],
      lineHeight: 1.4,
      weight: 400,
      italic: true,
      maxLines: 6,
      required: true,
      gapBefore: 28,
    });

  if (content.summary)
    items.push({
      kind: 'text',
      key: 'summary',
      text: content.summary,
      sizes: [TYPE.summary],
      lineHeight: 1.35,
      weight: 400,
      maxLines: 3,
      gapBefore: 16,
    });

  if (content.status) {
    blocks.set('status', statusLine(content.status, palette, options.width));
    items.push({
      kind: 'block',
      key: 'status',
      height: ROW.status,
      gapBefore: 24,
    });
  }

  if (content.meta.length)
    items.push({
      kind: 'row',
      key: 'meta',
      height: ROW.meta,
      gap: 28,
      items: content.meta.map((value, index) => ({
        key: `meta${index}`,
        node: meta(value, palette),
        maxWidth: options.width,
      })),
      gapBefore: 26,
    });

  if (content.stats.length)
    items.push({
      kind: 'row',
      key: 'stats',
      height: ROW.stat,
      gap: 32,
      items: content.stats.map((value, index) => ({
        key: `stat${index}`,
        node: stat(value, palette),
        maxWidth: options.width,
      })),
      gapBefore: 30,
    });

  if (content.related?.titles.length)
    items.push({
      kind: 'row',
      key: 'related',
      height: ROW.related,
      gap: 20,
      items: content.related.titles.map((title, index) => ({
        key: `related${index}`,
        node: related(content.related!.icon, title, palette),
        maxWidth: Math.min(options.width, 420),
      })),
      plus: (count) => plus(count, palette.muted, TYPE.meta),
      hiddenCount: content.related.total - content.related.titles.length,
      gapBefore: 14,
    });

  if (content.tags.length)
    items.push({
      kind: 'row',
      key: 'tags',
      height: ROW.tag,
      gap: 16,
      items: content.tags.map((title, index) => ({
        key: `tag${index}`,
        node: tagText(title, palette),
        maxWidth: Math.min(options.width, 360),
      })),
      plus: (count) => plus(count, palette.muted),
      hiddenCount: content.tagsTotal - content.tags.length,
      gapBefore: 14,
    });

  const ladder: OgFitStep[] = [
    { op: 'lines', key: 'summary', to: 2 },
    { op: 'lines', key: 'quote', to: 5 },
    { op: 'size', key: 'headline' },
    { op: 'size', key: 'quote' },
    { op: 'drop', key: 'tags' },
    { op: 'size', key: 'headline' },
    { op: 'drop', key: 'status' },
    { op: 'lines', key: 'summary', to: 1 },
    { op: 'size', key: 'quote' },
    { op: 'size', key: 'headline' },
    { op: 'drop', key: 'related' },
    { op: 'lines', key: 'quote', to: 4 },
    { op: 'size', key: 'headline' },
    { op: 'drop', key: 'summary' },
    { op: 'size', key: 'headline' },
    { op: 'drop', key: 'parent' },
    { op: 'size', key: 'headline' },
    { op: 'drop', key: 'meta' },
    { op: 'size', key: 'headline' },
    { op: 'drop', key: 'stats' },
    { op: 'size', key: 'headline' },
  ];

  return {
    plan: {
      width: options.width,
      height: options.height,
      items,
      ladder,
      ...(options.align ? { align: options.align } : {}),
    },
    painter: {
      text: (item, style) =>
        el(
          'div',
          {
            key: item.key === 'headline' ? 'essential:headline' : undefined,
            style: {
              ...style,
              color: item.key === 'summary' ? palette.muted : palette.text,
            },
          },
          item.text,
        ),
      block: (key) =>
        blocks.get(key) ?? el('div', { style: { display: 'flex' } }),
    },
  };
}

/**
 * A field of the accent where a picture would be: the accent running into
 * its neighbouring hue, lit from above, and dissolving into the card across
 * its left `fade` share — what a project without a banner has behind it,
 * the way its page's header does.
 */
export function accentField(
  accent: ImageAccent,
  width: number,
  height: number,
  fade: number,
  style: Record<string, unknown> = {},
): OgNode {
  const [light, deep] = vividPlate(accent).stops as [string, string];
  const [neighbour] = vividPlate({ ...accent, hue: accent.hue + 40 }).stops as [
    string,
  ];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>`,
    `<linearGradient id="field" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${neighbour}"/><stop offset="1" stop-color="${deep}"/></linearGradient>`,
    `<radialGradient id="light" cx="0.7" cy="0.25" r="0.65"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">${easedFadeStops(0, fade)}</linearGradient>`,
    `<mask id="mask"><rect width="${width}" height="${height}" fill="url(#fade)"/></mask></defs>`,
    `<g mask="url(#mask)"><rect width="${width}" height="${height}" fill="url(#field)"/><rect width="${width}" height="${height}" fill="url(#light)"/></g></svg>`,
  ].join('');
  return el('img', {
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    width,
    height,
    style,
  });
}

/** A box as absolute-position style. */
export function place(box: OgBox): Record<string, unknown> {
  return {
    display: 'flex',
    position: 'absolute',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  };
}
