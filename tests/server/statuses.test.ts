import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetType } from '../../shared/asset';
import type { StatusOwner } from '../../shared/status';
import { freshTestDb } from '../helpers/fresh-db';
import {
  applyStatusEdits,
  deleteStatusesForOwner,
  getStatusHistory,
  prepareEntityStatusEdits,
  projectStatusExists,
  statusUsageHooks,
} from '../../server/thei/statuses';

let context: Awaited<ReturnType<typeof freshTestDb>>;

const projectA: StatusOwner = { type: 'project', id: 'project-a' };
const projectB: StatusOwner = { type: 'project', id: 'project-b' };

function insertStatus(
  owner: StatusOwner,
  id: string,
  createdAt: number,
  kind: 'regular' | 'empty' = 'regular',
  assetUuid: string | null = null,
  date = new Date(createdAt).toISOString().slice(0, 10),
) {
  context.db
    .insert(context.schema.statuses)
    .values({
      id,
      ownerType: owner.type,
      ownerId: owner.id,
      kind,
      text: kind === 'regular' ? `Статус ${id}` : '',
      assetUuid,
      createdAt,
      date,
    })
    .run();
  if (assetUuid) {
    context.db
      .insert(context.schema.assets)
      .values({
        assetUuid,
        slug: assetUuid,
        extension: 'webp',
        familyUuid: `family-${assetUuid}`,
        contentHash: assetUuid.padEnd(64, '0'),
        settingsKey: 'original',
        settings: { type: 'original' },
        type: AssetType.Image,
        size: 5,
        touchedAt: 0,
        meta: null,
      })
      .onConflictDoNothing()
      .run();
    context.db
      .insert(context.schema.assetUsages)
      .values({
        assetUuid,
        containerType: 'project-status',
        containerId: id,
        role: 'icon',
      })
      .run();
  }
}

function usages() {
  return context.db
    .select()
    .from(context.schema.assetUsages)
    .all()
    .map((usage) => usage.containerId)
    .sort();
}

function save(
  owner: StatusOwner,
  input: Parameters<typeof prepareEntityStatusEdits>[1],
) {
  const prepared = prepareEntityStatusEdits(owner, {
    newStatuses: [],
    ...input,
  });
  const now = Date.now();
  context.db.transaction((tx) =>
    applyStatusEdits(
      tx,
      context.schema,
      prepared,
      now,
      statusUsageHooks(tx, context.schema, now, (message) => {
        throw new Error(message);
      }),
    ),
  );
}

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    assets: { findByUuid: vi.fn(async () => undefined) },
    projects: { findByUuid: vi.fn(async () => undefined) },
  });
  insertStatus(projectA, 'a-regular', 1_000, 'regular', 'asset-a');
  insertStatus(projectA, 'a-empty', 2_000, 'empty');
  insertStatus(projectB, 'b-regular', 1_500, 'regular', 'asset-b');
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

describe('status edits', () => {
  it('rejects rewrites before the transaction, not inside it', () => {
    // Another owner's status is not this owner's to rewrite.
    expect(() =>
      prepareEntityStatusEdits(projectA, {
        newStatuses: [],
        updatedStatuses: [{ id: 'b-regular', text: 'Чужой' }],
      }),
    ).toThrow('Invalid status');
    // An empty status can be filled in or moved, but not rewritten as it is.
    expect(() =>
      prepareEntityStatusEdits(projectA, {
        newStatuses: [],
        updatedStatuses: [{ id: 'a-empty', text: '' }],
      }),
    ).toThrow('Invalid status');
    // A new status may not reuse an id another owner already holds.
    expect(() =>
      prepareEntityStatusEdits(projectA, {
        newStatuses: [
          { id: 'b-regular', kind: 'regular', text: 'Статус b-regular' },
        ],
      }),
    ).toThrow('Status ID already exists');
  });

  it("knows a status only under its own project's address", () => {
    // A status icon is judged by the project in its address, so another
    // project's status must not be reachable through it.
    expect(projectStatusExists('project-a', 'a-regular')).toBe(true);
    expect(projectStatusExists('project-a', 'b-regular')).toBe(false);
    expect(projectStatusExists('project-b', 'b-regular')).toBe(true);
    expect(projectStatusExists('project-b', 'missing')).toBe(false);
  });

  it('leaves another owner alone when asked to delete its status', () => {
    save(projectA, { deletedStatusIds: ['b-regular'] });
    expect(usages()).toEqual(['a-regular', 'b-regular']);
    expect(
      context.db.select().from(context.schema.statuses).all(),
    ).toHaveLength(3);

    save(projectA, { deletedStatusIds: ['a-regular'] });
    expect(usages()).toEqual(['b-regular']);
  });

  it('drops a whole history with its icon usages, and nothing else', () => {
    context.db.transaction((tx) =>
      deleteStatusesForOwner(tx, context.schema, projectA),
    );
    expect(
      context.db
        .select()
        .from(context.schema.statuses)
        .all()
        .map((status) => status.id),
    ).toEqual(['b-regular']);
    expect(usages()).toEqual(['b-regular']);
  });

  it('looks the owning project up once per page, not once per icon', async () => {
    const asset = { assetUuid: 'asset-a' };
    context.server.assets.findByUuid = vi.fn(async () => asset) as any;
    const findProject = vi.fn(async () => undefined);
    context.server.projects.findByUuid = findProject as any;
    for (let index = 0; index < 5; index++)
      insertStatus(projectA, `a-extra-${index}`, 3_000 + index, 'regular');
    context.db
      .update(context.schema.statuses)
      .set({ assetUuid: 'asset-a' })
      .run();

    const page = await getStatusHistory(projectA);
    expect(page.items).toHaveLength(7);
    expect(findProject).toHaveBeenCalledTimes(1);
  });
});

describe('status dates', () => {
  const projectC: StatusOwner = { type: 'project', id: 'project-c' };
  const stored = (id: string) =>
    context.db
      .select()
      .from(context.schema.statuses)
      .all()
      .find((status) => status.id === id);
  const days = async (owner = projectC) =>
    (await getStatusHistory(owner)).items.map(
      (item) => `${item.date} ${item.id}`,
    );

  beforeEach(() => {
    insertStatus(projectC, 'r1', 10, 'regular', null, '2024-01-01');
    insertStatus(projectC, 'e1', 20, 'empty', null, '2024-02-01');
    insertStatus(projectC, 'r2', 30, 'regular', null, '2024-03-01');
  });

  it('dates a new status the day it is saved unless given a day', () => {
    save(projectC, {
      newStatuses: [
        { id: 'today', kind: 'regular', text: 'Сегодня' },
        { id: 'past', kind: 'regular', text: 'Давно', date: '2020-05-01' },
      ],
    });
    expect(stored('today')?.date).toBe(new Date().toISOString().slice(0, 10));
    expect(stored('past')?.date).toBe('2020-05-01');
    expect(() =>
      prepareEntityStatusEdits(projectC, {
        newStatuses: [
          { id: 'bad', kind: 'regular', text: 'Нет', date: '2024-02-30' },
        ],
      }),
    ).toThrow('Invalid status date');
  });

  it('orders a history by its days, then by when each was written', async () => {
    save(projectC, {
      newStatuses: [
        {
          id: 'late',
          kind: 'regular',
          text: 'Задним числом',
          date: '2024-01-01',
        },
      ],
    });
    expect(await days()).toEqual([
      '2024-03-01 r2',
      '2024-02-01 e1',
      '2024-01-01 late',
      '2024-01-01 r1',
    ]);
    // A rewrite moves a status to its new day and keeps what it said.
    save(projectC, {
      updatedStatuses: [{ id: 'r1', text: 'Статус r1', date: '2024-04-01' }],
    });
    expect(await days()).toEqual([
      '2024-04-01 r1',
      '2024-03-01 r2',
      '2024-02-01 e1',
      '2024-01-01 late',
    ]);
    expect(stored('r1')).toMatchObject({ text: 'Статус r1', createdAt: 10 });
    // Without a day, as an older panel sends it, a rewrite keeps the day.
    save(projectC, { updatedStatuses: [{ id: 'r2', text: 'Другой текст' }] });
    expect(stored('r2')?.date).toBe('2024-03-01');
  });

  it('pages through days, and through a cursor that knows no day', async () => {
    for (let index = 0; index < 3; index++)
      insertStatus(
        projectC,
        `x${index}`,
        40 + index,
        'regular',
        null,
        '2023-06-01',
      );
    const first = await getStatusHistory(projectC, undefined, false, 2);
    const second = await getStatusHistory(projectC, first.nextCursor, false, 2);
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
      'r2',
      'e1',
      'r1',
      'x2',
    ]);
    // A cursor handed out before statuses had days: its day is looked up.
    const legacy = Buffer.from(
      JSON.stringify({ createdAt: 20, id: 'e1' }),
    ).toString('base64url');
    expect(
      (await getStatusHistory(projectC, legacy, false, 2)).items.map(
        (item) => item.id,
      ),
    ).toEqual(['r1', 'x2']);
  });

  it('judges an empty status by the place its day gives it', () => {
    // Right above another empty one.
    expect(() =>
      save(projectC, {
        newStatuses: [{ id: 'e2', kind: 'empty', date: '2024-02-15' }],
      }),
    ).toThrow('Cannot append an empty status');
    // Right under another empty one.
    expect(() =>
      save(projectC, {
        newStatuses: [{ id: 'e2', kind: 'empty', date: '2024-01-15' }],
      }),
    ).toThrow('Cannot append an empty status');
    // With nothing below it.
    expect(() =>
      save(projectC, {
        newStatuses: [{ id: 'e2', kind: 'empty', date: '2023-12-01' }],
      }),
    ).toThrow('Cannot append an empty status');
    // Moved under the newest regular one, it stands above a regular one.
    expect(() =>
      save(projectC, {
        updatedStatuses: [{ id: 'e1', text: '', date: '2024-03-02' }],
      }),
    ).not.toThrow();
    expect(stored('e1')).toMatchObject({ kind: 'empty', date: '2024-03-02' });
    // A regular status given a day right under an empty one is no trouble.
    save(projectC, {
      newStatuses: [
        { id: 'r3', kind: 'regular', text: 'Между', date: '2024-03-01' },
      ],
    });
    expect(stored('r3')?.kind).toBe('regular');
  });

  it('takes a resent new status with its day as the same one', () => {
    const input = {
      newStatuses: [
        {
          id: 'again',
          kind: 'regular' as const,
          text: 'Повтор',
          date: '2024-05-05',
        },
      ],
    };
    save(projectC, input);
    save(projectC, input);
    expect(stored('again')?.date).toBe('2024-05-05');
    expect(() =>
      prepareEntityStatusEdits(projectC, {
        newStatuses: [{ ...input.newStatuses[0]!, date: '2024-05-06' }],
      }),
    ).toThrow('Status ID already exists');
  });

  it('ends a status as a caption, and takes it resent with a full stop as the same', () => {
    const input = (text: string) => ({
      newStatuses: [
        { id: 'ending', kind: 'regular' as const, text, date: '2024-06-01' },
      ],
    });
    save(projectC, input('Работаю над домом.'));
    expect(stored('ending')?.text).toBe('Работаю над домом');
    save(projectC, input('Работаю над домом'));
    expect(stored('ending')?.text).toBe('Работаю над домом');
  });
});
