import { defineMigration } from './types';

/**
 * More files are recognised as sound: an iPhone's voice memo (`m4a`), raw
 * AAC, Opus and Ogg audio, WebM audio (`weba`, which recordings are now
 * stored as) and AIFF. Those stored before were kept as plain files; they
 * become recordings, so a text can play them and the library files them
 * with the rest of the sound. Their bytes stay as they are, and their length
 * and waveform are read by the update task that follows.
 *
 * The list is written out rather than imported: it is the list of 0.0.4,
 * whatever later releases add to theirs.
 */
export default defineMigration({
  id: '0.0.4/003-audio-extensions',
  version: '0.0.4',
  title: {
    en: 'Recognise more audio files',
    ru: 'Распознавание новых аудиофайлов',
  },
  description: {
    en: 'Voice memos and other audio files stored as plain files become recordings that a text can play.',
    ru: 'Голосовые заметки и другие аудиофайлы, сохранённые как обычные файлы, становятся записями, которые можно проигрывать в тексте.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        "UPDATE `assets` SET `type` = 'audio' WHERE `type` = 'other' AND lower(`extension`) IN ('m4a', 'aac', 'opus', 'oga', 'weba', 'aif', 'aiff')",
      )
      .run();
  },
});
