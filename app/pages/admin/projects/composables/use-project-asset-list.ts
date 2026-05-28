import { useDragSort } from '#layers/thei/app/composables/drag-sort';

/**
 * Generic composable for any ordered project asset list (showcase, other-assets, …).
 *
 * @param items  - Reactive ref holding the current ordered array.
 * @param onSync - Called after every mutation so the caller can persist the new state.
 */
export function useProjectAssetList<T extends { assetUuid: string }>(
  items: Ref<T[]>,
  onSync: (items: T[]) => void,
) {
  function addItem(item: T) {
    items.value = [...items.value, item];
    onSync(items.value);
  }

  function updateItem(uuid: string, patch: Partial<T>) {
    const i = items.value.findIndex((it) => it.assetUuid === uuid);
    if (i === -1) return;
    const updated = [...items.value];
    updated[i] = { ...updated[i]!, ...patch };
    items.value = updated;
    onSync(items.value);
  }

  function removeItem(uuid: string) {
    items.value = items.value.filter((it) => it.assetUuid !== uuid);
    onSync(items.value);
  }

  const dragSort = useDragSort((from, to) => {
    const updated = [...items.value];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved!);
    items.value = updated;
    onSync(items.value);
  });

  return { addItem, updateItem, removeItem, dragSort };
}
