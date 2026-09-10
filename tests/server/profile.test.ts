import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_ID, type ProfileEditData } from '../../shared/profile';
import { freshTestDb } from '../helpers/fresh-db';
import { getProfileHistory, saveProfile } from '../../server/thei/profile';

let context: Awaited<ReturnType<typeof freshTestDb>>;

function edit(
  newStatuses: ProfileEditData['newStatuses'],
  deletedStatusIds: string[] = [],
): ProfileEditData {
  return {
    displayName: 'Тестовый профиль',
    slogan: '',
    nickname: '',
    birthDate: '',
    avatarAssetUuid: null,
    avatarChangeId: '',
    bannerAssetUuid: null,
    faviconAssetUuid: null,
    aboutContent: null,
    facts: [],
    pinnedPageUuids: [],
    externalLinks: [],
    newStatuses,
    deletedStatusIds,
    deletedAvatarIds: [],
  };
}

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    assets: { findByUuid: vi.fn(async () => undefined) },
    console: { tag: () => ({ warn: vi.fn() }) },
  });
  context.db
    .insert(context.schema.profiles)
    .values({ profileId: PROFILE_ID, displayName: 'Тестовый профиль' })
    .run();
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

describe('profile statuses', () => {
  it('rejects malformed list items and invalid input without partial writes', async () => {
    const malformedFacts = edit([]) as any;
    malformedFacts.facts = [null];
    await expect(saveProfile(malformedFacts)).rejects.toMatchObject({
      statusCode: 400,
    });

    const malformedStatuses = edit([null as any]);
    await expect(saveProfile(malformedStatuses)).rejects.toMatchObject({
      statusCode: 400,
    });

    const malformedLinks = edit([]) as any;
    malformedLinks.externalLinks = [{ url: 'javascript:alert(1)' }];
    await expect(saveProfile(malformedLinks)).rejects.toMatchObject({
      statusCode: 400,
    });

    const malformedContent = edit([]) as any;
    malformedContent.aboutContent = { data: { blocks: [null] } };
    await expect(saveProfile(malformedContent)).rejects.toMatchObject({
      statusCode: 400,
    });
    const invalidContentLink = edit([]) as any;
    invalidContentLink.aboutContent = {
      data: {
        blocks: [
          { type: 'externalLink', data: { url: 'javascript:alert(1)' } },
        ],
      },
    };
    await expect(saveProfile(invalidContentLink)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(
      context.db.select().from(context.schema.profileStatuses).all(),
    ).toEqual([]);
    expect(
      context.db.select().from(context.schema.profileExternalLinks).all(),
    ).toEqual([]);
  });

  it('enforces regular and empty status transitions and makes retries idempotent', async () => {
    await expect(
      saveProfile(
        edit([{ id: 'blank-regular', kind: 'regular', text: '   ' }]),
      ),
    ).rejects.toThrow('Invalid profile text');
    await expect(
      saveProfile(edit([{ id: 'empty-first', kind: 'empty' }])),
    ).rejects.toThrow('Cannot append an empty status');

    const regular = edit([
      { id: 'regular-1', kind: 'regular', text: 'Работаю над сайтом' },
    ]);
    await saveProfile(regular);
    await saveProfile(regular);
    expect(
      context.db.select().from(context.schema.profileStatuses).all(),
    ).toHaveLength(1);

    await saveProfile(edit([{ id: 'empty-1', kind: 'empty' }]));
    expect((await getProfileHistory('statuses')).items[0]?.kind).toBe('empty');
    await expect(
      saveProfile(edit([{ id: 'empty-2', kind: 'empty' }])),
    ).rejects.toThrow('Cannot append an empty status');

    await saveProfile(
      edit([{ id: 'regular-2', kind: 'regular', text: 'Снова на связи' }]),
    );
    expect((await getProfileHistory('statuses')).items[0]?.kind).toBe(
      'regular',
    );
    await expect(
      saveProfile(
        edit(
          [{ id: 'empty-after-deletions', kind: 'empty' }],
          ['regular-1', 'regular-2'],
        ),
      ),
    ).rejects.toThrow('Cannot append an empty status');

    const rows = context.db.select().from(context.schema.profileStatuses).all();
    expect(rows.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'regular-1', kind: 'regular' },
      { id: 'empty-1', kind: 'empty' },
      { id: 'regular-2', kind: 'regular' },
    ]);
    expect(
      context.db
        .select()
        .from(context.schema.assetUsages)
        .all()
        .filter((usage) => usage.containerId === 'empty-1'),
    ).toEqual([]);

    await saveProfile(edit([], ['empty-1']));
    expect(
      context.db
        .select()
        .from(context.schema.profileStatuses)
        .all()
        .some((status) => status.id === 'empty-1'),
    ).toBe(false);
  });

  it('paginates status history by timestamp and UUID without duplicates', async () => {
    context.db
      .insert(context.schema.profileStatuses)
      .values(
        Array.from({ length: 35 }, (_, index) => ({
          id: `status-${String(index).padStart(2, '0')}`,
          kind: 'regular' as const,
          text: `Статус ${index}`,
          createdAt: 1_000 + Math.floor(index / 2),
        })),
      )
      .run();

    const first = await getProfileHistory('statuses');
    const second = await getProfileHistory('statuses', first.nextCursor);
    expect(first.items).toHaveLength(30);
    expect(second.items).toHaveLength(5);
    expect(first.total).toBe(35);
    expect(second.total).toBe(35);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(35);
    expect(
      [...first.items, ...second.items].every(
        (item) => item.kind === 'regular',
      ),
    ).toBe(true);
  });

  it('does not expose a media URL when a referenced asset is missing', async () => {
    context.db
      .insert(context.schema.profileStatuses)
      .values({
        id: 'missing-media',
        kind: 'regular',
        text: 'Без файла',
        assetUuid: 'missing-asset',
        createdAt: 1,
      })
      .run();
    const item = (await getProfileHistory('statuses')).items[0];
    expect(item).toMatchObject({ id: 'missing-media', kind: 'regular' });
    expect(item?.media).toBeUndefined();
  });
});
