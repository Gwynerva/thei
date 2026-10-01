/**
 * The fonts a card is drawn with.
 *
 * Kept free of Nitro's globals: the Nuxt module reads this list to decide
 * which font files travel with the build, and the server reads the same list
 * to load them, so the two cannot disagree about a file.
 *
 * Noto Sans comes split into subsets by script, and satori resolves a family
 * name to the first font registered under it — two subsets under one name
 * and the second script comes out as empty boxes. So each subset is its own
 * family, and the stack below lets satori fall back per glyph. Weights and
 * the italic live inside each family, where satori picks the nearest.
 */
export const OG_FONT_SUBSETS = [
  { subset: 'latin', family: 'Noto Sans' },
  { subset: 'latin-ext', family: 'Noto Sans Latin Ext' },
  { subset: 'cyrillic', family: 'Noto Sans Cyrillic' },
  { subset: 'cyrillic-ext', family: 'Noto Sans Cyrillic Ext' },
  { subset: 'greek', family: 'Noto Sans Greek' },
  { subset: 'vietnamese', family: 'Noto Sans Vietnamese' },
] as const;

export type OgFontSubset = (typeof OG_FONT_SUBSETS)[number]['subset'];

/**
 * Regular for text, semibold for labels, bold for headlines, and an italic
 * for the words of a diary entry quoted on its card.
 */
export const OG_FONT_FACES = [
  { weight: 400, style: 'normal' },
  { weight: 600, style: 'normal' },
  { weight: 700, style: 'normal' },
  { weight: 400, style: 'italic' },
] as const;

export interface OgFontFile {
  file: string;
  family: string;
  subset: OgFontSubset;
  weight: (typeof OG_FONT_FACES)[number]['weight'];
  style: (typeof OG_FONT_FACES)[number]['style'];
}

export const OG_FONT_FILES: OgFontFile[] = OG_FONT_SUBSETS.flatMap(
  ({ subset, family }) =>
    OG_FONT_FACES.map(({ weight, style }) => ({
      file: `noto-sans-${subset}-${weight}-${style}.woff`,
      family,
      subset,
      weight,
      style,
    })),
);

export const OG_FONT_FAMILY = OG_FONT_SUBSETS.map(({ family }) => family).join(
  ', ',
);

/** The Nitro server-asset pattern that selects exactly these files. */
export function ogFontAssetPattern(): string {
  return `{${OG_FONT_FILES.map(({ file }) => file).join(',')}}`;
}
