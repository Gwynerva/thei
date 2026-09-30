import ranges from '@fontsource/noto-sans/unicode.json';
import { OG_FONT_SUBSETS } from './font-set';
import type { OgCardContent } from './model';

/**
 * Text as a card can draw it.
 *
 * A card carries a handful of Noto Sans subsets and nothing else, so a
 * character outside them — an emoji, a Chinese title, an arrow — would come
 * out as an empty box. Such characters are dropped before anything is laid
 * out. When too much of a text would be lost that way, the text is not
 * drawn at all: a title in a script the card cannot write is left to the
 * link preview's own title line, which carries it in full, and the card
 * falls back to naming what kind of thing it is.
 *
 * Runs of white space fold into one, but a no-break space stays what it is:
 * typography put it there so a short word never ends a line.
 */
export const OG_CLAIMED_RANGES: [number, number][] = OG_FONT_SUBSETS.flatMap(
  ({ subset }) =>
    (ranges as Record<string, string>)[subset]!.split(',').map((range) => {
      const [start, end = start] = range.replace('U+', '').split('-');
      return [Number.parseInt(start!, 16), Number.parseInt(end!, 16)] as [
        number,
        number,
      ];
    }),
);

/**
 * Characters the subsets' ranges claim and their files do not draw: most of
 * General Punctuation beyond the dashes and quotes, two arrows, a few Coptic
 * and Latin Extended-D letters. Found by drawing every claimed character; a
 * test draws them all again, so a font update that fills or opens a gap
 * fails it rather than drawing boxes.
 */
export const OG_FONT_GAPS = new Set(
  [
    '03E2-03EF',
    '1C89-1C8A',
    '2010-2012',
    '2015-2017',
    '201B',
    '201F',
    '2021',
    '2023-2025',
    '2027',
    '2030-2031',
    '2034-2038',
    '203B-2043',
    '2045-205E',
    '2191',
    '2193',
    '2215',
    'A7CB-A7CF',
    'A7D2',
    'A7D4',
    'A7DA-A7DC',
    'A7F1',
  ].flatMap((range) => {
    const [start, end = start] = range.split('-');
    const from = Number.parseInt(start!, 16);
    const to = Number.parseInt(end!, 16);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }),
);

/**
 * Drawable stand-ins for characters the fonts lack but a text may well
 * hold: a hyphen or a dash typed as its typographic variant.
 */
const SUBSTITUTES: Record<string, string> = {
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '\u2013',
  '\u2015': '\u2014',
};

export function ogCovers(character: string): boolean {
  const code = character.codePointAt(0)!;
  if (OG_FONT_GAPS.has(code)) return false;
  return OG_CLAIMED_RANGES.some(([start, end]) => code >= start && code <= end);
}

/** Share of a text's letters that may go missing before it is not drawn. */
const MAX_LOST_LETTERS = 0.3;

/**
 * The text as the card draws it, or `undefined` when there is nothing left
 * worth drawing.
 */
export function ogDrawable(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const folded = value
    .replace(/[\u2010-\u2012\u2015]/g, (character) => SUBSTITUTES[character]!)
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/[^\S\u00A0]+/g, ' ')
    .trim();
  let letters = 0;
  let lost = 0;
  let drawn = '';
  for (const character of folded) {
    const letter = /\p{L}/u.test(character);
    if (letter) letters++;
    if (ogCovers(character)) drawn += character;
    else if (letter) lost++;
  }
  drawn = drawn.replace(/ {2,}/g, ' ').trim();
  if (!drawn || !/[\p{L}\p{N}]/u.test(drawn)) return undefined;
  if (letters && lost / letters > MAX_LOST_LETTERS) return undefined;
  return drawn;
}

/**
 * The content with every word made drawable: an optional text that cannot
 * be drawn goes, a list keeps what can, and a headline that cannot falls
 * back to the parent's title and then to the name of the kind, which the
 * card's own phrases always can draw.
 */
export function drawableContent(
  content: OgCardContent,
  fallbackHeadline: string,
): OgCardContent {
  const list = (values: string[]) =>
    values.map(ogDrawable).filter((value): value is string => Boolean(value));
  const parentTitle = ogDrawable(content.parent?.title);
  return {
    ...content,
    headline:
      ogDrawable(content.headline) ??
      parentTitle ??
      ogDrawable(fallbackHeadline) ??
      fallbackHeadline,
    chips: content.chips
      .map((chip) => ({ ...chip, label: ogDrawable(chip.label) ?? '' }))
      .filter((chip) => chip.label),
    parent:
      content.parent && parentTitle
        ? { ...content.parent, title: parentTitle }
        : undefined,
    summary: ogDrawable(content.summary),
    quote: ogDrawable(content.quote),
    status: ogDrawable(content.status),
    meta: content.meta
      .map((item) => ({ ...item, text: ogDrawable(item.text) ?? '' }))
      .filter((item) => item.text),
    related: content.related && {
      ...content.related,
      titles: list(content.related.titles),
    },
    tags: list(content.tags),
    stats: content.stats
      .map((stat) => ({
        ...stat,
        value: ogDrawable(stat.value) ?? '',
        label: ogDrawable(stat.label) ?? '',
      }))
      .filter((stat) => stat.value),
    cloud: content.cloud
      .map((tag) => ({ ...tag, title: ogDrawable(tag.title) ?? '' }))
      .filter((tag) => tag.title),
    site: {
      ...content.site,
      name: ogDrawable(content.site.name) ?? content.site.domain ?? '',
    },
    ...(content.date
      ? {
          date: {
            weekday: ogDrawable(content.date.weekday) ?? '',
            day: ogDrawable(content.date.day) ?? '',
            month: ogDrawable(content.date.month) ?? '',
            year: ogDrawable(content.date.year) ?? '',
          },
        }
      : {}),
  };
}
