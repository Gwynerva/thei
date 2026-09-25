import { defineUpdateTask } from './types';

/**
 * Video previews used to be the first frame, black for many videos. They are
 * made again from a frame that shows the video, one video at a time in the
 * video lane. A video that cannot be read keeps its old preview; the file card
 * in the library can remake it by hand.
 */
export default defineUpdateTask({
  id: '0.0.2/001-preview-frames',
  version: '0.0.2',
  title: {
    en: 'Choose video preview frames',
    ru: 'Подбор кадров для превью видео',
  },
  description: {
    en: 'Previews taken from a first frame — black for many videos — are made again from a frame that shows the video.',
    ru: 'Превью, снятые с первого кадра — у многих видео чёрного, — делаются заново с кадра, по которому видно видео.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} videos`,
    ru: `${done} из ${total} видео`,
  }),
  async run({ progress }) {
    const { refreshFirstFramePreviews } =
      await import('#layers/thei/server/thei/assets/preview-refresh');
    await refreshFirstFramePreviews({ onProgress: progress });
  },
});
