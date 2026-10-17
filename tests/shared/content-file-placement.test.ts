import { describe, expect, it } from 'vitest';
import { AssetType } from '../../shared/asset';
import { ASSET_UPLOAD_LIMITS } from '../../shared/asset-upload-limits';
import {
  contentFileRequest,
  pastedMediaRequest,
} from '../../shared/asset-paste-defaults';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';
import {
  placeContentFiles,
  prepareContentFile,
  type ContentFileEntry,
} from '../../shared/content-file-placement';

const file = (name: string, type = '', size = 1) => ({ name, type, size });

/** A new file as the editor places it: by the name it is stored under. */
function brought(name: string, type = '', size = 1) {
  const prepared = prepareContentFile(file(name, type, size));
  if ('skipped' in prepared) throw new Error(prepared.skipped);
  return { file: prepared.name, assetType: prepared.assetType, size };
}

const stored = (
  assetUuid: string,
  type: AssetType,
  size = 1,
  archived?: number,
): ContentFileEntry<string> => ({
  asset: {
    assetUuid,
    type,
    size,
    ...(archived
      ? { archivedOriginal: { extension: 'zip', size: archived } }
      : {}),
  },
});

const MB = 1024 * 1024;

describe('a file brought into a text', () => {
  it('is known by its extension, as the server knows it', () => {
    expect(prepareContentFile(file('photo.PNG', 'image/png'))).toEqual({
      name: 'photo.PNG',
      assetType: AssetType.Image,
    });
    expect(prepareContentFile(file('notes.pdf', 'application/pdf'))).toEqual({
      name: 'notes.pdf',
      assetType: AssetType.Other,
    });
    // A browser that knows no type for Opus in WebM, or calls Ogg a video.
    expect(prepareContentFile(file('song.weba'))).toEqual({
      name: 'song.weba',
      assetType: AssetType.Audio,
    });
    expect(prepareContentFile(file('chant.ogg', 'video/ogg'))).toEqual({
      name: 'chant.ogg',
      assetType: AssetType.Audio,
    });
  });

  it('is renamed by its type when its name says another kind', () => {
    // A voice note saved as a WebM would be refused as a broken video.
    expect(prepareContentFile(file('voice.webm', 'audio/webm'))).toEqual({
      name: 'voice.weba',
      assetType: AssetType.Audio,
    });
    expect(prepareContentFile(file('memo.mp4', 'audio/mp4'))).toEqual({
      name: 'memo.m4a',
      assetType: AssetType.Audio,
    });
    expect(prepareContentFile(file('scan.jfif', 'image/jpeg'))).toEqual({
      name: 'scan.jpg',
      assetType: AssetType.Image,
    });
    // A pasted picture with no name to speak of.
    expect(prepareContentFile(file('image', 'image/png'))).toEqual({
      name: 'image.png',
      assetType: AssetType.Image,
    });
    // Within the same kind the name is kept.
    expect(prepareContentFile(file('clip.png', 'image/jpeg'))).toEqual({
      name: 'clip.png',
      assetType: AssetType.Image,
    });
  });

  it('is skipped when the site could never store it', () => {
    expect(prepareContentFile(file('Makefile'))).toEqual({
      skipped: 'extension',
    });
    // A folder copied from the file manager.
    expect(prepareContentFile(file('Photos', '', 0))).toEqual({
      skipped: 'empty',
    });
    expect(
      prepareContentFile(file('huge.zip', '', ASSET_UPLOAD_LIMITS.file + 1)),
    ).toEqual({ skipped: 'size' });
  });
});

describe('where brought files go', () => {
  it('makes one picture a media block and several a gallery', () => {
    expect(placeContentFiles([brought('photo.png')])).toEqual([
      {
        type: 'contentMedia',
        data: { layout: 'centered', files: ['photo.png'] },
      },
    ]);
    expect(
      placeContentFiles([brought('photo.png'), brought('clip.mp4')]),
    ).toEqual([
      {
        type: 'contentGallery',
        data: { items: [], files: ['photo.png', 'clip.mp4'] },
      },
    ]);
  });

  it('makes one other file a player or a file, and several a group', () => {
    expect(placeContentFiles([brought('memo.m4a')])).toEqual([
      { type: 'contentAudio', data: { files: ['memo.m4a'] } },
    ]);
    expect(placeContentFiles([brought('notes.pdf')])).toEqual([
      { type: 'contentAttachment', data: { files: ['notes.pdf'] } },
    ]);
    expect(
      placeContentFiles([brought('memo.m4a'), brought('song.weba')]),
    ).toEqual([
      {
        type: 'contentFileGroup',
        data: { items: [], files: ['memo.m4a', 'song.weba'] },
      },
    ]);
  });

  it('puts the pictures first and the other files after them', () => {
    expect(
      placeContentFiles([
        brought('notes.pdf'),
        brought('a.png'),
        brought('memo.m4a'),
        brought('b.jpg'),
      ]),
    ).toEqual([
      {
        type: 'contentGallery',
        data: { items: [], files: ['a.png', 'b.jpg'] },
      },
      {
        type: 'contentFileGroup',
        data: { items: [], files: ['notes.pdf', 'memo.m4a'] },
      },
    ]);
  });

  it('makes a video too large to be shown a file', () => {
    expect(
      placeContentFiles([
        brought('film.mp4', 'video/mp4', ASSET_UPLOAD_LIMITS.media + 1),
      ]),
    ).toEqual([{ type: 'contentAttachment', data: { files: ['film.mp4'] } }]);
  });

  it('measures a file of the library as the server does', () => {
    const [media] = placeContentFiles([
      stored('a-1', AssetType.Image, 20 * MB),
    ]);
    expect(media).toMatchObject({
      type: 'contentMedia',
      data: { asset: { assetUuid: 'a-1' } },
    });
    // Its own copy is small, but the original it keeps is not.
    expect(
      placeContentFiles([stored('a-2', AssetType.Image, 20 * MB, 150 * MB)]),
    ).toMatchObject([{ type: 'contentAttachment' }]);
  });

  it('gives files of the library their own place in a list', () => {
    const [gallery] = placeContentFiles<string>([
      stored('a-1', AssetType.Image),
      brought('b.png'),
    ]);
    expect(gallery).toMatchObject({
      type: 'contentGallery',
      data: { items: [{ asset: { assetUuid: 'a-1' } }], files: ['b.png'] },
    });
    expect((gallery!.data.items as { id: string }[])[0]!.id).toEqual(
      expect.any(String),
    );
  });
});

describe('what a new file is stored as, by its block', () => {
  const draft = (type: AssetType, extension: string) => ({
    type,
    extension,
    codec: undefined,
  });

  it('stores what is shown in place at the paste defaults', () => {
    for (const [block, type, extension] of [
      ['contentMedia', AssetType.Video, 'mp4'],
      ['contentGallery', AssetType.Image, 'png'],
      ['contentAudio', AssetType.Audio, 'wav'],
      ['contentFileGroup', AssetType.Audio, 'wav'],
    ] as const)
      expect(contentFileRequest(block, draft(type, extension))).toEqual(
        pastedMediaRequest(draft(type, extension)),
      );
  });

  it('keeps a file to download as it was brought', () => {
    expect(
      contentFileRequest('contentAttachment', draft(AssetType.Video, 'mp4')),
    ).toEqual(createOriginalAssetSettings());
    expect(
      contentFileRequest('contentFileGroup', draft(AssetType.Image, 'png')),
    ).toEqual(createOriginalAssetSettings());
  });
});
