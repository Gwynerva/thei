import { useDragSort } from './drag-sort';

/**
 * Keeps a reactive asset list and its persisted representation in sync.
 * Entity-specific mapping stays in the caller, so projects and events can
 * reuse the same mutation and pointer-sorting behavior.
 */
export function useOrderedAssetList<T extends { assetUuid: string }>(
  items: Ref<T[]>,
  onSync: (items: T[]) => void,
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

  const dragSort = useDragSort((from, to) => {
    const next = [...items.value];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    commit(next);
  });

  return { addItem, updateItem, removeItem, dragSort };
}
