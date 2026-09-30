import type { SatoriOptions } from 'satori';
import { OG_FONT_FILES } from './font-set';

type OgFonts = NonNullable<SatoriOptions['fonts']>;

let fontsPromise: Promise<OgFonts> | undefined;

/**
 * The card fonts, read once from the server assets the build carries.
 *
 * A missing file is an error that names it rather than a card with empty
 * boxes where a script should be: a build that lost a font is broken, and the
 * sooner it says which one, the sooner it is fixed. A failed load is not
 * remembered, so the next card tries again.
 */
export function loadOgFonts(): Promise<OgFonts> {
  fontsPromise ??= (async () => {
    const storage = useStorage('assets:thei-og-fonts');
    const missing: string[] = [];
    const fonts = await Promise.all(
      OG_FONT_FILES.map(async (font) => {
        const data = (await storage.getItemRaw(font.file)) as
          Buffer | ArrayBuffer | null;
        if (!data) missing.push(font.file);
        return {
          name: font.family,
          data: data ?? new ArrayBuffer(0),
          weight: font.weight,
          style: font.style,
        };
      }),
    );
    if (missing.length)
      throw new Error(
        `Open Graph fonts are missing from the build: ${missing.join(', ')}`,
      );
    return fonts;
  })().catch((error) => {
    fontsPromise = undefined;
    throw error;
  });
  return fontsPromise;
}
