import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetType } from '../../shared/asset';
import type { StatusOwner } from '../../shared/status';
import { freshTestDb } from '../helpers/fresh-db';
import {
  applyStatusEdits,
  deleteStatusesForOwner,
  getStatusHistory,
  prepareEntityStatusEdits,
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
    // An empty status can be filled in, but not with nothing.
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
