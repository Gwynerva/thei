import { defineUpdateTask } from './types';

/**
 * A recording's player draws its length and waveform before it loads a byte
 * of sound, from what the server read when the file was stored. Recordings
 * stored before were read for nothing; each is decoded once here, one at a
 * time in the sound lane. A file that cannot be read gets an empty waveform
 * and no length, and is named in the log: its player still plays what the
 * browser can, and asks the file its length.
 */
export default defineUpdateTask({
  id: '0.0.4/003-audio-waveforms',
  version: '0.0.4',
  title: {
    en: 'Read the waveforms of recordings',
    ru: 'Чтение звуковых волн записей',
  },
  description: {
    en: 'Each audio file is decoded once for its length and waveform, which its player shows before anything is loaded.',
    ru: 'Каждый аудиофайл декодируется один раз ради длительности и звуковой волны, которые плеер показывает до загрузки.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} recordings`,
    ru: `${done} из ${total} записей`,
  }),
  async run({ progress, log }) {
    const { completeAudioMetas } =
      await import('#layers/thei/server/thei/assets/audio');
    const { unreadable } = await completeAudioMetas({ onProgress: progress });
    for (const asset of unreadable)
      log(
        `${asset.slug}.${asset.extension} (${asset.assetUuid}) could not be read as sound; its player shows no waveform.`,
      );
  },
});
