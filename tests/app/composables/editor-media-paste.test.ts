import { describe, expect, it } from 'vitest';
import { pastedMediaBlocks } from '../../../app/composables/editor-media-paste';

const file = (name: string, type = '') => new File(['x'], name, { type });

describe('what pasted files become', () => {
  it('makes one picture a media block and several a gallery', () => {
    const photo = file('photo.png', 'image/png');
    const clip = file('clip.mp4', 'video/mp4');
    expect(pastedMediaBlocks([photo])).toEqual([
      { type: 'contentMedia', data: { layout: 'centered', files: [photo] } },
    ]);
    expect(pastedMediaBlocks([photo, clip])).toEqual([
      { type: 'contentGallery', data: { items: [], files: [photo, clip] } },
    ]);
  });

  it('gives each recording a player of its own, after the pictures', () => {
    const photo = file('photo.png', 'image/png');
    const memo = file('Memo.M4A', 'audio/x-m4a');
    // A browser that knows no type for Opus in WebM, or calls Ogg a video.
    const song = file('song.weba');
    const ogg = file('chant.ogg', 'video/ogg');
    expect(
      pastedMediaBlocks([memo, photo, song, ogg], { audio: true }),
    ).toEqual([
      { type: 'contentMedia', data: { layout: 'centered', files: [photo] } },
      { type: 'contentAudio', data: { files: [memo] } },
      { type: 'contentAudio', data: { files: [song] } },
      { type: 'contentAudio', data: { files: [ogg] } },
    ]);
  });

  it('leaves recordings to Editor.js where there is no player for them', () => {
    expect(pastedMediaBlocks([file('memo.m4a', 'audio/mp4')])).toEqual([]);
    // Not even one a browser calls a video.
    expect(pastedMediaBlocks([file('chant.ogg', 'video/ogg')])).toEqual([]);
  });

  it('leaves anything else alone, an audio-only WebM included', () => {
    expect(
      pastedMediaBlocks(
        [
          file('notes.pdf', 'application/pdf'),
          file('voice.webm', 'audio/webm'),
        ],
        { audio: true },
      ),
    ).toEqual([]);
  });
});
