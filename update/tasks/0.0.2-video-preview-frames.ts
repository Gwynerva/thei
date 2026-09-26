import { defineUpdateTask } from './types';

/**
 * Video previews used to be the first frame, black for many videos, or the
 * first frame found lively enough. Each video's frames are now compared
 * across its whole length and the most colourful, well exposed one becomes
 * the preview, one video at a time in the video lane. A video that cannot
 * be read keeps its old preview; the file card in the library can remake it
 * by hand.
 */
export default defineUpdateTask({
  id: '0.0.2/001-video-preview-frames',
  version: '0.0.2',
  title: {
    en: 'Choose video preview frames',
    ru: 'Подбор кадров для превью видео',
  },
  description: {
    en: 'Each video is looked at across its whole length, and its most colourful, well exposed frame becomes the preview and sets its accent colour.',
    ru: 'Каждое видео просматривается по всей длине, и самый насыщенный, хорошо освещённый кадр становится превью и задаёт акцентный цвет.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} videos`,
    ru: `${done} из ${total} видео`,
  }),
  async run({ progress }) {
    const { refreshVideoPreviews } =
      await import('#layers/thei/server/thei/assets/preview-refresh');
    await refreshVideoPreviews({ onProgress: progress });
  },
});
