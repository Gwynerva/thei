import { defineUpdateTask } from './types';

/**
 * An SVG that repeats symbols sized in SVG 2 fashion — a pattern of icons
 * over a banner — was drawn by librsvg with every symbol blown up to the
 * whole picture: its preview, the accent read from it and its Open Graph
 * card came out dark and unrecognisable. Such SVGs are drawn again now that
 * their symbols are sized for librsvg; the cards follow the new accent.
 *
 * A bitmap once saved from such an SVG holds the wrong pixels in the file
 * itself and is not redrawn here: the log names it, and saving the picture
 * again from its SVG redraws it.
 */
export default defineUpdateTask({
  id: '0.0.4/001-svg-symbol-previews',
  version: '0.0.4',
  title: {
    en: 'Redraw SVG previews drawn with symbols',
    ru: 'Перерисовка превью SVG с символами',
  },
  description: {
    en: 'Previews and accent colours of SVG files that repeat symbols are drawn again: those symbols used to be stretched over the whole picture.',
    ru: 'Превью и акцентные цвета SVG-файлов с повторяющимися символами рисуются заново: раньше символы растягивались на всю картинку.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} files`,
    ru: `${done} из ${total} файлов`,
  }),
  async run({ progress, log }) {
    const { refreshSvgSymbolPreviews } =
      await import('#layers/thei/server/thei/assets/preview-refresh');
    const { rasterised } = await refreshSvgSymbolPreviews({
      onProgress: progress,
    });
    for (const asset of rasterised)
      log(
        `${asset.slug}.${asset.extension} (${asset.assetUuid}) was saved as a bitmap from an SVG drawn with symbols and keeps its old pixels; save it again from the SVG to redraw it.`,
      );
  },
});
