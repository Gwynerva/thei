import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAssetByUuid } from '../../server/thei/assets/repository/find-by-uuid';
import { findAssetsByContainer } from '../../server/thei/assets/repository/usages/find-by-container';
import {
  buildContentFieldValue,
  buildContentPreviewMedia,
  findContentByOwner,
} from '../../server/thei/content/repository';
import { buildContentPreview } from '../../shared/content';
import { freshTestDb } from '../helpers/fresh-db';

/**
 * An admin list draws each row's picture from the text's first one. It is
 * looked up alone, and has to be the very picture the whole text, hydrated,
 * would give.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    assets: {
      findByUuid: findAssetByUuid,
      usages: { findByContainer: findAssetsByContainer },
    },
    content: { findByOwner: findContentByOwner },
  });
});

afterEach(async () => {
  await context.close();
});

function asset(uuid: string, type: 'image' | 'audio') {
  context.db
    .insert(context.schema.assets)
    .values({
      assetUuid: uuid,
      slug: uuid,
      extension: type === 'image' ? 'webp' : 'mp3',
      familyUuid: uuid,
      contentHash: `${uuid}-hash`,
      settingsKey: type,
      settings: null,
      type: type as never,
      size: 1,
      touchedAt: 1,
      meta: null,
    })
    .run();
}

function body(blocks: unknown[]) {
  context.db
    .insert(context.schema.content)
    .values({
      contentUuid: 'c-1',
      ownerType: 'event',
      ownerId: 'e-1',
      slot: 'event-body',
      data: { blocks },
      createdAt: 1,
      updatedAt: 1,
    } as never)
    .run();
}

describe('the preview picture of a text', () => {
  it('is the first picture the whole text would show, looked up alone', async () => {
    asset('sound', 'audio');
    asset('photo', 'image');
    asset('later', 'image');
    body([
      { id: 'p', type: 'paragraph', data: { text: 'Words first' } },
      // A file gone from the library, and one with nothing to show.
      {
        id: 'm1',
        type: 'contentMedia',
        data: { asset: { assetUuid: 'gone' }, layout: 'stretch' },
      },
      {
        id: 'g',
        type: 'contentGallery',
        data: {
          items: [
            { id: 'g1', asset: { assetUuid: 'sound' } },
            { id: 'g2', asset: { assetUuid: 'photo' } },
          ],
        },
      },
      {
        id: 'm2',
        type: 'contentMedia',
        data: { asset: { assetUuid: 'later' }, layout: 'stretch' },
      },
    ]);

    const alone = await buildContentPreviewMedia('event', 'e-1', 'event-body');
    const whole = buildContentPreview(
      (await buildContentFieldValue('event', 'e-1', 'event-body'))?.data,
    ).media;
    expect(alone).toBeDefined();
    expect(alone).toEqual(whole);
    expect(alone?.src).toContain('photo');
  });

  it('is nothing for a text without one, or no text at all', async () => {
    body([{ id: 'p', type: 'paragraph', data: { text: 'Only words' } }]);
    expect(
      await buildContentPreviewMedia('event', 'e-1', 'event-body'),
    ).toBeUndefined();
    expect(
      await buildContentPreviewMedia('event', 'e-2', 'event-body'),
    ).toBeUndefined();
  });
});
