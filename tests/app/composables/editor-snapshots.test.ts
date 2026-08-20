import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EDITOR_SNAPSHOT_LIMIT,
  EDITOR_SNAPSHOT_INTERVAL,
  createEditorSnapshotManager,
  cleanEditorSnapshot,
  editorSnapshotStorageKey,
  groupEditorSnapshotsByDay,
  loadEditorSnapshots,
  migrateEditorSnapshots,
} from '../../../app/composables/editor-snapshots';
import type { ContentOutputData } from '../../../shared/content';

function data(text: string): ContentOutputData {
  return {
    blocks: text ? [{ id: text, type: 'paragraph', data: { text } }] : [],
  };
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('editor snapshots', () => {
  beforeEach(() => vi.useRealTimers());

  it('groups newest-first snapshots by local calendar day', () => {
    const firstDay = new Date(2026, 7, 12, 23, 55).getTime();
    const sameDay = new Date(2026, 7, 12, 8, 5).getTime();
    const previousDay = new Date(2026, 7, 11, 18, 30).getTime();
    const entries = [firstDay, sameDay, previousDay].map(
      (createdAt, index) => ({
        createdAt,
        data: data(String(index)),
      }),
    );

    const groups = groupEditorSnapshotsByDay(entries);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.dayStart).toBe(new Date(2026, 7, 12).getTime());
    expect(groups[0]?.snapshots.map((entry) => entry.createdAt)).toEqual([
      firstDay,
      sameDay,
    ]);
    expect(groups[1]?.dayStart).toBe(new Date(2026, 7, 11).getTime());
  });

  it('synchronizes without capturing a snapshot', async () => {
    const storage = createStorage();
    let current = data('0');
    const manager = createEditorSnapshotManager({
      storageKey: 'content:test',
      storage,
      read: async () => structuredClone(current),
      render: async (next) => {
        current = structuredClone(next);
      },
    });
    await manager.initialize();

    expect(manager.snapshots.value).toHaveLength(0);
    current = data('changed');
    manager.recordChange();
    expect(await manager.synchronize()).toEqual(data('changed'));
    expect(manager.current()).toEqual(data('changed'));
    expect(manager.snapshots.value).toHaveLength(0);
    manager.destroy();
  });

  it('keeps existing history unchanged during initialization and synchronization', async () => {
    const storage = createStorage();
    storage.setItem(
      editorSnapshotStorageKey('existing'),
      JSON.stringify([{ createdAt: 1, data: data('saved snapshot') }]),
    );
    let current = data('current');
    const manager = createEditorSnapshotManager({
      storageKey: 'existing',
      storage,
      read: async () => structuredClone(current),
      render: async () => undefined,
    });

    await manager.initialize();
    expect(manager.snapshots.value).toHaveLength(1);
    expect(manager.snapshots.value[0]?.data).toEqual(data('saved snapshot'));

    current = data('saved without snapshot');
    manager.recordChange();
    await manager.synchronize();
    expect(manager.snapshots.value).toHaveLength(1);
    expect(manager.snapshots.value[0]?.data).toEqual(data('saved snapshot'));
    manager.destroy();
  });

  it('keeps the stretch media layout in snapshots', () => {
    expect(
      cleanEditorSnapshot({
        blocks: [
          {
            id: 'media',
            type: 'contentMedia',
            data: {
              layout: 'stretch',
              asset: { assetUuid: 'asset' },
            },
          },
        ],
      }),
    ).toEqual({
      blocks: [
        {
          id: 'media',
          type: 'contentMedia',
          data: {
            layout: 'stretch',
            asset: { assetUuid: 'asset' },
          },
        },
      ],
    });
  });

  it('drops Editor.js service metadata and deduplicates changing block ids on the timer', async () => {
    vi.useFakeTimers();
    const storage = createStorage();
    let current = {
      time: 123,
      version: '2.31.6',
      blocks: [{ id: 'first-id', type: 'paragraph', data: { text: 'same' } }],
    };
    expect(cleanEditorSnapshot(current)).toEqual({
      blocks: [{ id: 'first-id', type: 'paragraph', data: { text: 'same' } }],
    });
    const manager = createEditorSnapshotManager({
      storageKey: 'metadata',
      storage,
      read: async () => cleanEditorSnapshot(current),
      render: async () => undefined,
    });
    await manager.initialize();
    current = {
      ...current,
      blocks: [{ id: 'second-id', type: 'paragraph', data: { text: 'same' } }],
    };
    manager.recordChange();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    expect(manager.snapshots.value).toHaveLength(1);
    current = {
      ...current,
      blocks: [{ id: 'third-id', type: 'paragraph', data: { text: 'same' } }],
    };
    manager.recordChange();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    expect(manager.snapshots.value).toHaveLength(1);
    manager.destroy();
  });

  it('keeps hydrated snapshots but deduplicates them by canonical content', async () => {
    vi.useFakeTimers();
    const storage = createStorage();
    let current: ContentOutputData = {
      blocks: [
        {
          id: 'media-block',
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: {
              assetUuid: 'asset-1',
              assetUrl: '/first',
              media: { kind: 'image', src: '/first.webp' },
            },
          },
        },
      ],
    };
    const manager = createEditorSnapshotManager({
      storageKey: 'hydrated-assets',
      storage,
      read: async () => structuredClone(current),
      render: async () => undefined,
    });
    await manager.initialize();
    manager.recordChange();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    expect(
      manager.snapshots.value[0]?.data.blocks[0]?.data.asset,
    ).toMatchObject({
      assetUuid: 'asset-1',
      assetUrl: '/first',
    });

    current = {
      blocks: [
        {
          id: 'regenerated-id',
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: {
              assetUuid: 'asset-1',
              assetUrl: '/second',
              size: 999,
              media: { kind: 'image', src: '/second.webp' },
            },
          },
        },
      ],
    };
    manager.recordChange();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    expect(manager.snapshots.value).toHaveLength(1);
    manager.destroy();
  });

  it('captures only every three minutes, retains the newest 30 entries, and stops after destroy', async () => {
    vi.useFakeTimers();
    const storage = createStorage();
    let current = data('initial');
    let now = 0;
    const manager = createEditorSnapshotManager({
      storageKey: 'timer',
      storage,
      now: () => ++now,
      read: async () => structuredClone(current),
      render: async () => undefined,
    });
    await manager.initialize();

    expect(manager.snapshots.value).toHaveLength(0);
    current = data('before three minutes');
    manager.recordChange();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL - 1);
    expect(manager.snapshots.value).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(manager.snapshots.value).toHaveLength(1);

    for (let index = 1; index <= EDITOR_SNAPSHOT_LIMIT; index++) {
      current = data(String(index));
      manager.recordChange();
      await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    }

    expect(manager.snapshots.value).toHaveLength(EDITOR_SNAPSHOT_LIMIT);
    expect(manager.snapshots.value[0]?.data.blocks[0]?.data.text).toBe('30');
    expect(manager.snapshots.value.at(-1)?.data.blocks[0]?.data.text).toBe('1');
    current.blocks[0]!.data.text = 'mutated';
    expect(manager.snapshots.value[0]?.data.blocks[0]?.data.text).toBe('30');

    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    expect(manager.snapshots.value).toHaveLength(EDITOR_SNAPSHOT_LIMIT);
    manager.destroy();
    current = data('too late');
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    expect(manager.snapshots.value).toHaveLength(EDITOR_SNAPSHOT_LIMIT);
  });

  it('restores without adding a reverse snapshot and reports the draft change', async () => {
    vi.useFakeTimers();
    const storage = createStorage();
    let current = data('first');
    const changes: ContentOutputData[] = [];
    const manager = createEditorSnapshotManager({
      storageKey: 'restore',
      storage,
      read: async () => structuredClone(current),
      render: async (next) => {
        current = structuredClone(next);
      },
      onCurrentChange: (next) => changes.push(next),
    });
    await manager.initialize();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    current = data('second');
    manager.recordChange();
    await vi.advanceTimersByTimeAsync(EDITOR_SNAPSHOT_INTERVAL);
    const count = manager.snapshots.value.length;

    expect(await manager.restore(manager.snapshots.value[1]!)).toBe(true);
    expect(current.blocks[0]?.data.text).toBe('first');
    expect(manager.snapshots.value).toHaveLength(count);
    expect(changes.at(-1)?.blocks[0]?.data.text).toBe('first');
    manager.destroy();
  });

  it('ignores corrupt storage and migrates temporary entries into a persistent key', () => {
    const storage = createStorage();
    storage.setItem(editorSnapshotStorageKey('bad'), '{broken');
    expect(loadEditorSnapshots('bad', storage)).toEqual([]);
    storage.setItem(
      editorSnapshotStorageKey('draft'),
      JSON.stringify([{ createdAt: 10, data: data('draft') }]),
    );
    storage.setItem(
      editorSnapshotStorageKey('content:id'),
      JSON.stringify([{ createdAt: 5, data: data('saved') }]),
    );

    migrateEditorSnapshots('draft', 'content:id', storage);

    expect(
      loadEditorSnapshots('content:id', storage).map(
        (entry) => entry.data.blocks[0]?.data.text,
      ),
    ).toEqual(['draft', 'saved']);
    expect(storage.getItem(editorSnapshotStorageKey('draft'))).toBeNull();
  });

  it('loads and migrates only the newest 30 unique entries', () => {
    const storage = createStorage();
    const entries = Array.from(
      { length: EDITOR_SNAPSHOT_LIMIT + 5 },
      (_, index) => ({ createdAt: index + 1, data: data(String(index + 1)) }),
    );
    storage.setItem(
      editorSnapshotStorageKey('oversized'),
      JSON.stringify(entries),
    );

    const loaded = loadEditorSnapshots('oversized', storage);
    expect(loaded).toHaveLength(EDITOR_SNAPSHOT_LIMIT);
    expect(loaded[0]?.createdAt).toBe(35);
    expect(loaded.at(-1)?.createdAt).toBe(6);

    storage.setItem(
      editorSnapshotStorageKey('migration-source'),
      JSON.stringify(entries.slice(15)),
    );
    storage.setItem(
      editorSnapshotStorageKey('migration-target'),
      JSON.stringify(entries.slice(0, 20)),
    );
    migrateEditorSnapshots('migration-source', 'migration-target', storage);

    const migrated = loadEditorSnapshots('migration-target', storage);
    expect(migrated).toHaveLength(EDITOR_SNAPSHOT_LIMIT);
    expect(migrated[0]?.createdAt).toBe(35);
    expect(migrated.at(-1)?.createdAt).toBe(6);
    expect(
      storage.getItem(editorSnapshotStorageKey('migration-source')),
    ).toBeNull();
  });
});
