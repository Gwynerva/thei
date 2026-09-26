import { defineUpdateTask } from './types';

/**
 * SVG previews used to be drawn at the size of the drawing's own units, so a
 * small icon got a preview as small, blurred wherever it was shown larger.
 * They are drawn again at the size a preview is shown, and the accent colour
 * is read from the new one.
 */
export default defineUpdateTask({
  id: '0.0.2/003-svg-previews',
  version: '0.0.2',
  title: {
    en: 'Redraw SVG previews',
    ru: 'Перерисовка превью SVG',
  },
  description: {
    en: 'Previews of SVG files are drawn again at full preview size, so small icons are no longer blurred.',
    ru: 'Превью SVG-файлов рисуются заново в полном размере превью, и маленькие иконки больше не мылятся.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} files`,
    ru: `${done} из ${total} файлов`,
  }),
  async run({ progress }) {
    const { refreshSvgPreviews } =
      await import('#layers/thei/server/thei/assets/preview-refresh');
    await refreshSvgPreviews({ onProgress: progress });
  },
});
