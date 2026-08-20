import type EditorJS from '@editorjs/editorjs';
import type { OutputBlockData } from '@editorjs/editorjs';
import { computed, readonly, ref } from 'vue';
import {
  contentSemanticKey,
  normalizeContentData,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import { stripHydratedContentInlineLinks } from '#layers/thei/shared/content-link';

export const EDITOR_SNAPSHOT_LIMIT = 30;
export const EDITOR_SNAPSHOT_INTERVAL = 180_000;
const EDITOR_SNAPSHOT_STORAGE_PREFIX = 'thei:content-editor-snapshots:v2:';

export interface EditorSnapshotEntry {
  createdAt: number;
  data: ContentOutputData;
}

export interface EditorSnapshotReference {
  createdAt: number;
  data: unknown;
}

export interface EditorSnapshotDayGroup {
  dayStart: number;
  snapshots: EditorSnapshotReference[];
}

export interface EditorSnapshotManagerOptions {
  storageKey: string;
  read: () => Promise<ContentOutputData>;
  render: (data: ContentOutputData) => Promise<void>;
  onCurrentChange?: (data: ContentOutputData) => void;
  onError?: (error: unknown) => void;
  storage?: Storage;
  now?: () => number;
  intervalMs?: number;
  limit?: number;
}

export function editorSnapshotStorageKey(key: string) {
  return `${EDITOR_SNAPSHOT_STORAGE_PREFIX}${key}`;
}

export function persistentEditorSnapshotKey(contentUuid: string) {
  return `content:${contentUuid}`;
}

export function migrateEditorSnapshots(
  sourceKey: string,
  targetKey: string,
  storage: Storage = localStorage,
) {
  if (sourceKey === targetKey) return;
  const source = loadEditorSnapshots(sourceKey, storage);
  const target = loadEditorSnapshots(targetKey, storage);
  const entries = deduplicateEntries([...source, ...target])
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, EDITOR_SNAPSHOT_LIMIT);
  persistEditorSnapshots(targetKey, entries, storage);
  storage.removeItem(editorSnapshotStorageKey(sourceKey));
}

export function loadEditorSnapshots(
  key: string,
  storage: Storage = localStorage,
): EditorSnapshotEntry[] {
  try {
    const parsed = JSON.parse(
      storage.getItem(editorSnapshotStorageKey(key)) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return deduplicateEntries(
      parsed.flatMap((entry): EditorSnapshotEntry[] => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          typeof entry.createdAt !== 'number' ||
          !Number.isFinite(entry.createdAt)
        ) {
          return [];
        }
        try {
          return [
            {
              createdAt: entry.createdAt,
              data: cleanEditorSnapshot(entry.data),
            },
          ];
        } catch {
          return [];
        }
      }),
    )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, EDITOR_SNAPSHOT_LIMIT);
  } catch {
    return [];
  }
}

export function groupEditorSnapshotsByDay(
  snapshots: readonly EditorSnapshotReference[],
): EditorSnapshotDayGroup[] {
  const groups = new Map<number, EditorSnapshotReference[]>();
  for (const snapshot of snapshots) {
    const date = new Date(snapshot.createdAt);
    const dayStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
    const group = groups.get(dayStart);
    if (group) group.push(snapshot);
    else groups.set(dayStart, [snapshot]);
  }
  return Array.from(groups, ([dayStart, entries]) => ({
    dayStart,
    snapshots: entries,
  })).sort((left, right) => right.dayStart - left.dayStart);
}

export function createEditorSnapshotManager(
  options: EditorSnapshotManagerOptions,
) {
  const storage =
    options.storage ?? (import.meta.client ? localStorage : undefined);
  const now = options.now ?? Date.now;
  const limit = options.limit ?? EDITOR_SNAPSHOT_LIMIT;
  const intervalMs = options.intervalMs ?? EDITOR_SNAPSHOT_INTERVAL;
  const snapshots = ref<EditorSnapshotEntry[]>(
    storage ? loadEditorSnapshots(options.storageKey, storage) : [],
  );
  const isApplying = ref(false);
  const isCapturing = ref(false);
  const hasPendingCapture = ref(false);
  const isPending = computed(
    () => isCapturing.value || hasPendingCapture.value || isApplying.value,
  );
  let currentData = cleanEditorSnapshot({ blocks: [] });
  let currentKey = snapshotKey(currentData);
  let changeVersion = 0;
  let captureLoopPromise: Promise<void> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let destroyed = false;

  async function initialize() {
    const data = await readStable();
    setCurrent(data);
    interval = setInterval(
      () => void captureScheduledSnapshot().catch(() => undefined),
      intervalMs,
    );
    return cloneSnapshot(data);
  }

  function recordChange() {
    if (destroyed || isApplying.value) return;
    changeVersion += 1;
    hasPendingCapture.value = true;
    startCaptureLoop();
  }

  async function synchronize() {
    await flush();
    const data = await readStable();
    setCurrent(data);
    return cloneSnapshot(data);
  }

  async function captureScheduledSnapshot() {
    if (destroyed) return cloneSnapshot(currentData);
    try {
      const data = await synchronize();
      addSnapshot(data);
      return data;
    } catch (error) {
      options.onError?.(error);
      throw error;
    }
  }

  async function restore(entry: EditorSnapshotReference) {
    if (destroyed) return false;
    isApplying.value = true;
    changeVersion += 1;
    hasPendingCapture.value = false;
    try {
      await flush();
      const data = cleanEditorSnapshot(entry.data);
      await options.render(cloneSnapshot(data));
      if (destroyed) return false;
      setCurrent(data, true);
      return true;
    } catch (error) {
      options.onError?.(error);
      return false;
    } finally {
      isApplying.value = false;
    }
  }

  function current() {
    return cloneSnapshot(currentData);
  }

  function destroy() {
    destroyed = true;
    changeVersion += 1;
    hasPendingCapture.value = false;
    if (interval) clearInterval(interval);
    interval = undefined;
  }

  function startCaptureLoop() {
    if (captureLoopPromise || destroyed || isApplying.value) return;
    captureLoopPromise = captureLoop().finally(() => {
      captureLoopPromise = undefined;
      if (hasPendingCapture.value && !destroyed && !isApplying.value) {
        startCaptureLoop();
      }
    });
  }

  async function captureLoop() {
    isCapturing.value = true;
    try {
      while (hasPendingCapture.value && !destroyed && !isApplying.value) {
        hasPendingCapture.value = false;
        try {
          const data = await readStable();
          if (!destroyed && !isApplying.value) setCurrent(data);
        } catch (error) {
          if (!destroyed) options.onError?.(error);
        }
      }
    } finally {
      isCapturing.value = false;
    }
  }

  async function flush() {
    if (hasPendingCapture.value && !isApplying.value) startCaptureLoop();
    while (captureLoopPromise) await captureLoopPromise;
  }

  async function readStable() {
    while (true) {
      const version = changeVersion;
      const data = cleanEditorSnapshot(await options.read());
      if (version === changeVersion || destroyed || isApplying.value) {
        return data;
      }
    }
  }

  function setCurrent(data: ContentOutputData, force = false) {
    const next = cleanEditorSnapshot(data);
    const key = snapshotKey(next);
    currentData = next;
    if (!force && key === currentKey) return;
    currentKey = key;
    options.onCurrentChange?.(cloneSnapshot(next));
  }

  function addSnapshot(data: ContentOutputData) {
    const clean = cleanEditorSnapshot(data);
    const key = snapshotKey(clean);
    if (snapshots.value.some((entry) => snapshotKey(entry.data) === key)) {
      return false;
    }
    snapshots.value = [
      { createdAt: now(), data: cloneSnapshot(clean) },
      ...snapshots.value,
    ].slice(0, limit);
    if (storage) {
      persistEditorSnapshots(options.storageKey, snapshots.value, storage);
    }
    return true;
  }

  return {
    snapshots: readonly(snapshots),
    isApplying: readonly(isApplying),
    isPending,
    initialize,
    recordChange,
    synchronize,
    restore,
    current,
    destroy,
  };
}

export async function readCleanEditorOutput(
  editor: EditorJS,
): Promise<ContentOutputData> {
  const blocks: OutputBlockData[] = [];
  const blockCount = editor.blocks.getBlocksCount();
  for (let index = 0; index < blockCount; index++) {
    const block = editor.blocks.getBlockByIndex(index);
    if (!block) continue;
    const saved = (await block.save()) as
      | {
          id: string;
          tool: string;
          data: OutputBlockData['data'];
          tunes?: OutputBlockData['tunes'];
        }
      | undefined;
    if (!saved) continue;
    blocks.push({
      id: saved.id,
      type: saved.tool,
      data: stripHydratedContentInlineLinks(
        saved.data,
      ) as OutputBlockData['data'],
      ...(saved.tunes && Object.keys(saved.tunes).length > 0
        ? { tunes: saved.tunes }
        : {}),
    });
  }
  return cleanEditorSnapshot({ blocks });
}

export function cleanEditorSnapshot(value: unknown): ContentOutputData {
  return { blocks: normalizeContentData(value).blocks };
}

function persistEditorSnapshots(
  key: string,
  entries: EditorSnapshotEntry[],
  storage: Storage,
) {
  try {
    storage.setItem(editorSnapshotStorageKey(key), JSON.stringify(entries));
  } catch {
    // Snapshot persistence is best-effort and must never block editing.
  }
}

function deduplicateEntries(entries: EditorSnapshotEntry[]) {
  const keys = new Set<string>();
  return entries.filter((entry) => {
    const key = snapshotKey(entry.data);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function snapshotKey(data: ContentOutputData) {
  return contentSemanticKey(data);
}

function cloneSnapshot(data: ContentOutputData): ContentOutputData {
  return JSON.parse(JSON.stringify(data)) as ContentOutputData;
}
