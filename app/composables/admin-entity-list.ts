import {
  canonicalizeAdminEntityListRouteQuery,
  type AdminEntityListOrder,
  type AdminPaginatedResponse,
} from '#layers/thei/shared/admin/entity-list';

export async function useAdminEntityList<T>(endpoint: string, key: string) {
  const route = useRoute();
  const router = useRouter();
  const search = ref(queryString(route.query.q));
  let syncingSearch = false;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  onBeforeUnmount(() => clearTimeout(searchTimer));

  const order = computed<AdminEntityListOrder>({
    get: () => (route.query.order === 'oldest' ? 'oldest' : 'newest'),
    set: (value) => {
      void replaceQuery({
        order: value === 'oldest' ? 'oldest' : undefined,
        page: undefined,
      });
    },
  });
  const page = computed(() => positiveInteger(route.query.page, 1));
  const requestQuery = computed(() => ({
    q: queryString(route.query.q),
    order: order.value,
    page: page.value,
    pageSize: 20,
  }));

  const fetchResult = useFetch<AdminPaginatedResponse<T>>(endpoint, {
    key,
    query: requestQuery,
  });

  async function syncCanonicalQuery(resolvedPage?: number) {
    const canonical = canonicalizeAdminEntityListRouteQuery(
      route.query,
      resolvedPage,
    );
    const currentQ = route.query.q;
    const currentOrder = route.query.order;
    const currentPage = route.query.page;
    const expectedPage = canonical.page?.toString();

    if (
      currentQ === canonical.q &&
      currentOrder === canonical.order &&
      currentPage === expectedPage
    ) {
      return;
    }

    await replaceQuery(canonical);
  }

  onMounted(() => {
    void syncCanonicalQuery(fetchResult.data.value?.page);
  });

  watch(
    search,
    (value) => {
      if (syncingSearch) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        void replaceQuery({ q: value.trim() || undefined, page: undefined });
      }, 250);
    },
    { flush: 'sync' },
  );
  watch(
    () => route.query.q,
    (value) => {
      const next = queryString(value);
      if (next === search.value) return;
      syncingSearch = true;
      search.value = next;
      syncingSearch = false;
    },
  );
  watch(
    () => [route.query.q, route.query.order, route.query.page] as const,
    () => {
      void syncCanonicalQuery();
    },
  );
  watch(
    () => fetchResult.data.value?.page,
    (resolvedPage) => {
      if (!resolvedPage) return;
      void syncCanonicalQuery(resolvedPage);
    },
  );

  async function replaceQuery(
    values: Record<string, string | number | undefined>,
  ) {
    await router.replace({
      query: { ...route.query, ...values },
    });
  }

  async function setPage(nextPage: number) {
    await router.push({
      query: {
        ...route.query,
        page: nextPage === 1 ? undefined : nextPage,
      },
    });
  }

  await fetchResult;

  return {
    data: fetchResult.data,
    error: fetchResult.error,
    status: fetchResult.status,
    refresh: fetchResult.refresh,
    search,
    order,
    page,
    setPage,
  };
}

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function positiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
