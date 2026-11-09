import { resolveUpdateText } from '../text';
import { ensureFfmpeg, FfmpegInstallError } from '../ffmpeg/install';
import { FFMPEG_VERSION } from '../ffmpeg/tools';
import { defineUpdatePhase } from './types';

/**
 * Brings the ffmpeg this release runs.
 *
 * Until 0.0.7 ffmpeg came as an npm package holding a build from 2018. From
 * 0.0.8 the engine fetches a current static build, pinned by checksum, into
 * the instance's `.thei/bin/ffmpeg/<version>/` (`update/ffmpeg/`). The
 * download needs github.com, which the update needs anyway to install the
 * engine; without it this phase fails and the update stops before the
 * build, with the site as it was; so does a server that cannot unpack the
 * archive for want of `xz`, which is asked before anything is downloaded.
 * The version the previous build runs stays where it is until that build has
 * gone: the new one sweeps it on boot. With `THEI_FFMPEG` set — a platform
 * without a pinned build, or a distribution's ffmpeg — the operator's own is
 * asked whether it runs, and nothing is fetched.
 */
export default defineUpdatePhase({
  id: '0.0.8/001-ffmpeg',
  version: '0.0.8',
  title: {
    en: `Install ffmpeg ${FFMPEG_VERSION}`,
    ru: `Установка ffmpeg ${FFMPEG_VERSION}`,
  },
  description: {
    en: 'Video and sound are processed by a current ffmpeg fetched into the site’s own directory instead of the old one that came as a package.',
    ru: 'Видео и звук обрабатывает современный ffmpeg, загружаемый в папку сайта, вместо старого, который приходил пакетом.',
  },
  async run({ projectPath, languageCode, log }) {
    try {
      await ensureFfmpeg({ projectPath, log });
    } catch (error) {
      const reason =
        error instanceof FfmpegInstallError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      throw new Error(
        resolveUpdateText(
          {
            en: `ffmpeg could not be installed, so the update stops here and the site keeps its current version. ${reason}`,
            ru: `Не удалось установить ffmpeg, поэтому обновление остановлено, а сайт остаётся на текущей версии. ${reason}`,
          },
          languageCode,
        ),
      );
    }
  },
});
