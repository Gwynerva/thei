import { createHash } from 'node:crypto';
import { oklchToHex } from '#layers/thei/shared/accent-color';
import {
  el,
  fitText,
  OG_FONT_FAMILY,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  type OgNode,
} from './render';

/**
 * The three cards a link preview can need.
 *
 * - **content**: anything with artwork of its own — a project, an event, a
 *   stage, a section, a tag, a page. The artwork fills the left, cut off at an
 *   angle, and the right side names the thing and says what it is.
 * - **home**: the site itself, as a person: avatar, name, slogan.
 * - **service**: a listing or a tool — Life, Search, Tags. No artwork, just the
 *   page's own icon, so a service page never looks like a piece of content.
 *
 * Nothing in the admin panel has a card at all: it is not shared, and a
 * preview of it would only leak what the site looks like from inside.
 */
export interface OgCardBase {
  siteName: string;
  /** PNG data URI of the site icon, drawn beside the site name. */
  faviconDataUri?: string;
  accentHue: number;
  accentChroma: number;
}

export interface OgContentCard extends OgCardBase {
  kind: 'content';
  title: string;
  /** What this is: "Project", "Event", "Project stage"… */
  label: string;
  /** A date or period, when the entity has one. */
  meta?: string;
  /** PNG data URI of the poster. Without it the accent plate stands alone. */
  posterDataUri?: string;
  /** SVG data URI drawn in place of a poster, in the entity's accent. */
  glyphDataUri?: string;
}

export interface OgHomeCard extends OgCardBase {
  kind: 'home';
  title: string;
  slogan?: string;
  avatarDataUri?: string;
}

export interface OgServiceCard extends OgCardBase {
  kind: 'service';
  title: string;
  description?: string;
  glyphDataUri?: string;
}

export type OgCard = OgContentCard | OgHomeCard | OgServiceCard;

/**
 * Text as the card can draw it.
 *
 * The card carries four small font subsets and nothing else, so an emoji has
 * no glyph and would come out as an empty box. Dropping it is better than
 * showing the box, and a title rarely depends on one.
 */
export function ogText(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BACKGROUND = '#0b0e13';
const TEXT = '#f5f7fa';
const TEXT_MUTED = '#9aa6b8';
const POSTER_WIDTH = 520;
const PANEL_PADDING = 56;
const SKEW_DEGREES = 5;

function accent(card: OgCardBase, lightness: number) {
  return oklchToHex(lightness, card.accentChroma, card.accentHue);
}

function header(card: OgCardBase): OgNode {
  return el(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
    card.faviconDataUri
      ? el('img', {
          src: card.faviconDataUri,
          width: 48,
          height: 48,
          style: { borderRadius: '12px' },
        })
      : el('div', {
          style: {
            display: 'flex',
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: accent(card, 0.5),
          },
        }),
    el(
      'div',
      {
        style: {
          display: 'flex',
          fontSize: '28px',
          fontWeight: 600,
          color: TEXT_MUTED,
        },
      },
      ogText(card.siteName),
    ),
  );
}

function frame(card: OgCardBase, ...children: OgNode[]): OgNode {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        width: `${OG_IMAGE_WIDTH}px`,
        height: `${OG_IMAGE_HEIGHT}px`,
        background: BACKGROUND,
        fontFamily: OG_FONT_FAMILY,
        color: TEXT,
        position: 'relative',
      },
    },
    // A wash of the entity's own colour, so cards of different things are
    // distinguishable at a glance in a feed of links.
    el('div', {
      style: {
        position: 'absolute',
        inset: '0',
        background: `linear-gradient(135deg, ${accent(card, 0.32)}40 0%, ${BACKGROUND} 60%)`,
        display: 'flex',
      },
    }),
    ...children,
  );
}

export async function buildOgCard(card: OgCard): Promise<OgNode> {
  if (card.kind === 'home') return buildHomeCard(card);
  if (card.kind === 'service') return buildServiceCard(card);
  return buildContentCard(card);
}

async function buildContentCard(card: OgContentCard): Promise<OgNode> {
  const textWidth = OG_IMAGE_WIDTH - POSTER_WIDTH - PANEL_PADDING * 2;
  const title = await fitText(ogText(card.title), {
    width: textWidth,
    maxHeight: 300,
    sizes: [68, 60, 52, 44, 38],
    lineHeight: 1.12,
    weight: 700,
    maxLines: 4,
  });

  return frame(
    card,
    // The poster is skewed as a whole and the image inside is skewed back, so
    // the artwork stays upright behind a slanted edge.
    el(
      'div',
      {
        style: {
          display: 'flex',
          position: 'absolute',
          top: '0',
          left: '-60px',
          width: `${POSTER_WIDTH + 60}px`,
          height: `${OG_IMAGE_HEIGHT}px`,
          overflow: 'hidden',
          background: accent(card, 0.45),
          transform: `skewX(-${SKEW_DEGREES}deg)`,
        },
      },
      el(
        'div',
        {
          style: {
            display: 'flex',
            width: '100%',
            height: '100%',
            transform: `skewX(${SKEW_DEGREES}deg) scale(1.12)`,
          },
        },
        card.posterDataUri
          ? el('img', {
              src: card.posterDataUri,
              style: {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            })
          : el(
              'div',
              {
                style: {
                  display: 'flex',
                  width: '100%',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(160deg, ${accent(card, 0.52)} 0%, ${accent(card, 0.34)} 100%)`,
                },
              },
              ...(card.glyphDataUri
                ? [
                    el('img', {
                      src: card.glyphDataUri,
                      width: 200,
                      height: 200,
                      style: { opacity: 0.85 },
                    }),
                  ]
                : []),
            ),
      ),
    ),
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          top: '0',
          left: `${POSTER_WIDTH}px`,
          width: `${OG_IMAGE_WIDTH - POSTER_WIDTH}px`,
          height: `${OG_IMAGE_HEIGHT}px`,
          padding: `${PANEL_PADDING}px`,
        },
      },
      header(card),
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: `${title.fontSize}px`,
            lineHeight: 1.12,
            fontWeight: 700,
            // A single long word has nowhere to wrap, so it is allowed to
            // break: a cut-off title would run past the edge of the card.
            wordBreak: 'break-word',
            ...(title.lineClamp ? { lineClamp: title.lineClamp } : {}),
          },
        },
        ogText(card.title),
      ),
      el(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '26px',
            color: TEXT_MUTED,
          },
        },
        el(
          'div',
          {
            style: {
              display: 'flex',
              padding: '6px 18px',
              borderRadius: '999px',
              background: `${accent(card, 0.55)}33`,
              color: accent(card, 0.75),
              fontWeight: 600,
            },
          },
          ogText(card.label),
        ),
        ...(card.meta
          ? [el('div', { style: { display: 'flex' } }, ogText(card.meta))]
          : []),
      ),
    ),
  );
}

async function buildHomeCard(card: OgHomeCard): Promise<OgNode> {
  const title = await fitText(ogText(card.title), {
    width: 620,
    maxHeight: 200,
    sizes: [76, 66, 56, 46],
    lineHeight: 1.1,
    weight: 700,
    maxLines: 3,
  });
  return frame(
    card,
    el(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '56px',
          width: '100%',
          height: '100%',
          padding: `${PANEL_PADDING}px`,
        },
      },
      card.avatarDataUri
        ? el('img', {
            src: card.avatarDataUri,
            width: 300,
            height: 300,
            style: {
              borderRadius: '150px',
              border: `8px solid ${accent(card, 0.5)}`,
            },
          })
        : el('div', {
            style: {
              display: 'flex',
              width: '300px',
              height: '300px',
              borderRadius: '150px',
              background: accent(card, 0.5),
            },
          }),
      el(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            flex: '1',
          },
        },
        el(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: `${title.fontSize}px`,
              lineHeight: 1.1,
              fontWeight: 700,
              wordBreak: 'break-word',
              ...(title.lineClamp ? { lineClamp: title.lineClamp } : {}),
            },
          },
          ogText(card.title),
        ),
        ...(card.slogan
          ? [
              el(
                'div',
                {
                  style: {
                    display: 'flex',
                    fontSize: '30px',
                    lineHeight: 1.3,
                    color: TEXT_MUTED,
                    lineClamp: 3,
                  },
                },
                ogText(card.slogan),
              ),
            ]
          : []),
      ),
    ),
  );
}

async function buildServiceCard(card: OgServiceCard): Promise<OgNode> {
  const title = await fitText(ogText(card.title), {
    width: OG_IMAGE_WIDTH - PANEL_PADDING * 2,
    maxHeight: 200,
    sizes: [76, 66, 56, 46],
    lineHeight: 1.1,
    weight: 700,
    maxLines: 2,
  });
  return frame(
    card,
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: `${PANEL_PADDING}px`,
        },
      },
      header(card),
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '40px' } },
        el(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '160px',
              height: '160px',
              borderRadius: '40px',
              background: `${accent(card, 0.55)}2e`,
            },
          },
          ...(card.glyphDataUri
            ? [el('img', { src: card.glyphDataUri, width: 96, height: 96 })]
            : []),
        ),
        el(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              flex: '1',
            },
          },
          el(
            'div',
            {
              style: {
                display: 'flex',
                fontSize: `${title.fontSize}px`,
                lineHeight: 1.1,
                fontWeight: 700,
                wordBreak: 'break-word',
                ...(title.lineClamp ? { lineClamp: title.lineClamp } : {}),
              },
            },
            card.title,
          ),
          ...(card.description
            ? [
                el(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      fontSize: '28px',
                      lineHeight: 1.3,
                      color: TEXT_MUTED,
                      lineClamp: 2,
                    },
                  },
                  ogText(card.description),
                ),
              ]
            : []),
        ),
      ),
      el('div', { style: { display: 'flex', height: '48px' } }),
    ),
  );
}

/**
 * What the drawing itself is, as a hash.
 *
 * Cached cards are named after their content, not after the code that drew
 * them, so an update that changes the layout would otherwise keep serving the
 * old pictures. The cache compares this against a sidecar and starts over when
 * they differ — the same trick the generated icons use, and the reason no
 * version number appears in the address.
 */
export function ogTemplateSignature(): string {
  return createHash('sha256')
    .update(
      [
        OG_IMAGE_WIDTH,
        OG_IMAGE_HEIGHT,
        POSTER_WIDTH,
        PANEL_PADDING,
        SKEW_DEGREES,
        BACKGROUND,
        TEXT,
        TEXT_MUTED,
        ogText.toString(),
        header.toString(),
        frame.toString(),
        accent.toString(),
        buildContentCard.toString(),
        buildHomeCard.toString(),
        buildServiceCard.toString(),
        // Type size is chosen here, so a change in how it is chosen changes
        // the picture just as much as the layout does.
        fitText.toString(),
      ].join('|'),
    )
    .digest('hex');
}
