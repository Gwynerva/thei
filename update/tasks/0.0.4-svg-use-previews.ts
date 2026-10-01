import { defineUpdateTask } from './types';

/**
 * An SVG that reuses sized parts — symbols or nested drawings, such as a
 * pattern of icons over a banner — was drawn by librsvg with every reused
 * part blown up to the whole picture: its preview, the accent read from it and its Open Graph
 * card came out dark and unrecognisable. Such SVGs are drawn again now that
 * those parts are sized for librsvg; the cards follow the new accent.
 *
 * A bitmap once saved from such an SVG holds the wrong pixels in the file
 * itself and is not redrawn here: the log names it, and saving the picture
 * again from its SVG redraws it.
 */
export default defineUpdateTask({
  id: '0.0.4/001-svg-use-previews',
  version: '0.0.4',
  title: {
    en: 'Redraw SVG previews with reused parts',
    ru: 'Перерисовка превью SVG с повторяющимися частями',
  },
  description: {
    en: 'Previews and accent colours of SVG files that reuse symbols or nested drawings are drawn again: those parts used to be stretched over the whole picture.',
    ru: 'Превью и акцентные цвета SVG-файлов, которые повторяют символы или вложенные рисунки, рисуются заново: раньше эти части растягивались на всю картинку.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} files`,
    ru: `${done} из ${total} файлов`,
  }),
  async run({ progress, log }) {
    const { refreshSvgUsePreviews } =
      await import('#layers/thei/server/thei/assets/preview-refresh');
    const { rasterised } = await refreshSvgUsePreviews({
      onProgress: progress,
    });
    for (const asset of rasterised)
      log(
        `${asset.slug}.${asset.extension} (${asset.assetUuid}) was saved as a bitmap from an SVG with reused parts and keeps its old pixels; save it again from the SVG to redraw it.`,
      );
  },
});
