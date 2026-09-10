import type {
  ProfileHistoryItemBase,
  ProfileHistoryPage,
} from '#layers/thei/shared/profile';
export function useProfileHistory<T extends ProfileHistoryItemBase>(
  url: string,
  initial?: ProfileHistoryPage<T>,
) {
  const items = shallowRef<T[]>(initial?.items ?? []);
  const cursor = ref(initial?.nextCursor);
  const total = ref(initial?.total ?? 0);
  const loaded = ref(Boolean(initial));
  const loading = ref(false);
  const error = ref(false);
  let generation = 0;
  function reset(page?: ProfileHistoryPage<T>) {
    generation++;
    items.value = page?.items ?? [];
    cursor.value = page?.nextCursor;
    total.value = page?.total ?? 0;
    loaded.value = Boolean(page);
    loading.value = false;
    error.value = false;
  }
  async function load() {
    if (loading.value || (loaded.value && !cursor.value)) return;
    const current = generation;
    loading.value = true;
    error.value = false;
    try {
      const page = await $fetch<ProfileHistoryPage<T>>(url, {
        query: { cursor: cursor.value },
      });
      if (generation !== current) return;
      const ids = new Set(items.value.map((i) => i.id));
      items.value = [
        ...items.value,
        ...page.items.filter((i) => !ids.has(i.id)),
      ];
      cursor.value = page.nextCursor;
      total.value = page.total;
      loaded.value = true;
    } catch {
      if (generation === current) error.value = true;
    } finally {
      if (generation === current) loading.value = false;
    }
  }
  return { items, cursor, total, loaded, loading, error, load, reset };
}
