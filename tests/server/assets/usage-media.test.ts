import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetPlacement } from '../../../shared/asset-library';
import type { MediaDescriptor } from '../../../shared/media';

const findContentEntity = vi.fn();
vi.mock('../../../server/thei/content-entities', () => ({
  findContentEntity: (...args: unknown[]) => findContentEntity(...args),
}));

const { withPlaceMedia } =
  await import('../../../server/thei/assets/usage-media');

function picture(src: string): MediaDescriptor {
  return { src, previewSrc: src, kind: 'image' } as MediaDescriptor;
}

function placement(
  type: AssetPlacement['source']['type'],
  id: string,
  role: AssetPlacement['role'] = 'content',
): AssetPlacement {
  return {
    source: { type, id, title: id, summary: '', updatedAt: 0 },
    role,
    isPrivate: false,
    count: 1,
  };
}

beforeEach(() => {
  findContentEntity.mockReset();
});

it('gives each place the picture that stands for it, looked up once', async () => {
  const media = vi.fn((view: string) =>
    Promise.resolve(picture(`/icon-${view}`)),
  );
  findContentEntity.mockResolvedValue({ media });
  const placed = await withPlaceMedia([
    placement('project', 'p', 'showcase'),
    placement('project', 'p', 'icon'),
  ]);
  expect(placed.map((item) => item.source.media?.src)).toEqual([
    '/icon-admin',
    '/icon-admin',
  ]);
  expect(findContentEntity).toHaveBeenCalledTimes(1);
  expect(media).toHaveBeenCalledWith('admin', true);
});

it('leaves a place that is no entity, or has no record, without one', async () => {
  // Every id but the gone one has a picture, whatever kind it is asked as.
  findContentEntity.mockImplementation(({ entityId }: { entityId: string }) =>
    Promise.resolve(
      entityId === 'gone'
        ? undefined
        : { media: () => Promise.resolve(picture(`/${entityId}`)) },
    ),
  );
  const placed = await withPlaceMedia([
    placement('profile', 'me'),
    placement('ai-session', 's'),
    placement('event', 'gone'),
    placement('event', 'kept'),
  ]);
  expect(placed.map((item) => item.source.media?.src)).toEqual([
    undefined,
    undefined,
    undefined,
    '/kept',
  ]);
});

it('a picture that fails to resolve does not fail the list', async () => {
  findContentEntity.mockRejectedValue(new Error('broken'));
  const [item] = await withPlaceMedia([placement('event', 'e')]);
  expect(item?.source.media).toBeUndefined();
});
