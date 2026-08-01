import { moveItemById, useDragSort } from './drag-sort';

/**
 * Keeps a reactive asset list and its persisted representation in sync.
 * Entity-specific mapping stays in the caller, so projects and events can
 * reuse the same mutation and sorting behavior.
 */
export function useOrderedAssetList<T extends { assetUuid: string }>(
  items: Ref<T[]>,
  onSync: (items: T[]) => void,
  root: MaybeRefOrGetter<HTMLElement | null | undefined>,
) {
  function commit(next: T[]) {
    items.value = next;
    onSync(next);
  }

  function addItem(item: T) {
    commit([...items.value, item]);
  }

  function updateItem(assetUuid: string, patch: Partial<T>) {
    const index = items.value.findIndex((item) => item.assetUuid === assetUuid);
    if (index === -1) return;
    const next = [...items.value];
    next[index] = { ...next[index]!, ...patch };
    commit(next);
  }

  function removeItem(assetUuid: string) {
    commit(items.value.filter((item) => item.assetUuid !== assetUuid));
  }

  const dragSort = useDragSort(root, {
    onDrop: ({ id, newIndex }) => {
      commit(moveItemById(items.value, id, newIndex, (item) => item.assetUuid));
    },
  });

  return { addItem, updateItem, removeItem, dragSort };
}
