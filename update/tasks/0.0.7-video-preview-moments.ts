import { defineUpdateTask } from './types';

/**
 * A video's preview frame picked here was said to stand at the start of the
 * second it was picked from, not at its own moment: a player put there — the
 * file window's still, the tick on its bar — showed another frame. Each video
 * whose frame the owner did not choose has it picked again, one at a time in
 * the video lane, and keeps the same frame at its true moment. A video that
 * cannot be read keeps its preview as it was. Nothing marks a video done: a
 * pass cut short looks at every one again, which picks the same frames.
 */
export default defineUpdateTask({
  id: '0.0.7/003-video-preview-moments',
  version: '0.0.7',
  title: {
    en: 'Find the moments of video preview frames',
    ru: 'Уточнение моментов кадров превью видео',
  },
  description: {
    en: 'Each video whose preview frame was picked automatically is looked at again, so that its preview frame is where the player shows it.',
    ru: 'Каждое видео с автоматически подобранным кадром превью просматривается снова, чтобы кадр превью стоял там, где его показывает плеер.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} videos`,
    ru: `${done} из ${total} видео`,
  }),
  async run({ progress, log }) {
    const { refreshPickedVideoPreviews } =
      await import('#layers/thei/server/thei/assets/preview-refresh');
    const { total, failed } = await refreshPickedVideoPreviews({
      onProgress: progress,
    });
    if (failed)
      log(
        `${failed} of ${total} videos could not be read and kept their preview.`,
      );
  },
});
