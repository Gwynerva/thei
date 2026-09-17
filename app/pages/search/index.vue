<script lang="ts" setup>
import type { PublicSearchResponse } from '#layers/thei/shared/api/public';
import {
  countPublicSearchFilters,
  parsePublicSearchFilters,
  PUBLIC_SEARCH_DEBOUNCE_MS,
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
  publicSearchQuery,
  type PublicSearchFilters,
} from '#layers/thei/shared/public-search';

definePageMeta({ layout: 'public' });
const route = useRoute();
const router = useRouter();
const input = useTemplateRef<HTMLInputElement>('input');

const parsed = computed(() => parsePublicSearchFilters(route.query));
// The mobile sheet is a modal, and a modal holds the URL still: while it is
// open, filters live in a draft that already drives the results, and the URL
// catches up once it closes.
const sheetOpen = ref(false);
const draft = shallowRef<PublicSearchFilters | null>(null);
const filters = computed<PublicSearchFilters>(() => {
  if (draft.value) return draft.value;
  const { page: _page, ...rest } = parsed.value;
  return rest;
});
const resource = await useFetch<PublicSearchResponse>('/api/search', {
  query: computed(() =>
    publicSearchQuery(filters.value, draft.value ? 1 : parsed.value.page),
  ),
});
const search = useRequiredResource(resource);
const pending = computed(() => resource.status.value === 'pending');
const activeFilterCount = computed(() =>
  countPublicSearchFilters(filters.value),
);
const hasCriteria = computed(
  () => Boolean(filters.value.q.trim()) || activeFilterCount.value > 0,
);

usePublicSeo({
  title: () =>
    filters.value.q.trim()
      ? `${filters.value.q.trim()} — ${phrase.value.search}`
      : phrase.value.search,
  description: () => phrase.value.public_search_description,
  canonical: '/search/',
  noIndex: hasCriteria,
});

function sameQuery(next: Record<string, string>) {
  const current = Object.entries(route.query);
  return (
    current.length === Object.keys(next).length &&
    current.every(([key, value]) => next[key] === value)
  );
}

async function applyFilters(
  patch: Partial<PublicSearchFilters>,
  mode: 'push' | 'replace' = 'push',
) {
  const next = { ...filters.value, ...patch };
  if (sheetOpen.value) {
    draft.value = next;
    return;
  }
  const query = publicSearchQuery(next);
  if (!sameQuery(query)) await router[mode]({ path: route.path, query });
}

async function commitDraft() {
  sheetOpen.value = false;
  if (!draft.value) return;
  await applyFilters({});
  draft.value = null;
}

// Typing searches on its own after a pause; Enter searches right away.
const text = ref(filters.value.q);
let typingTimer: ReturnType<typeof setTimeout> | undefined;
function commitText() {
  clearTimeout(typingTimer);
  void applyFilters({ q: text.value }, 'replace');
}
watch(text, () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(commitText, PUBLIC_SEARCH_DEBOUNCE_MS);
});
watch(
  () => filters.value.q,
  (q) => {
    if (q.trim() !== text.value.trim()) text.value = q;
  },
);
onBeforeUnmount(() => clearTimeout(typingTimer));

function clearText() {
  text.value = '';
  commitText();
  input.value?.focus();
}

onMounted(() => input.value?.focus({ preventScroll: true }));
</script>

<template>
  <main
    class="m-auto flex w-(--width-wide) flex-col gap-md px-window py-lg
      pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:gap-lg sm:pb-lg"
  >
    <h1 class="sr-only">{{ phrase.search }}</h1>
    <form role="search" class="group relative" @submit.prevent="commitText">
      <Icon
        name="search"
        class="pointer-events-none absolute top-1/2 left-sm z-1 -translate-y-1/2
          text-2xl text-text-3 transition group-focus-within:text-accent"
      />
      <input
        ref="input"
        v-model="text"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        :maxlength="PUBLIC_SEARCH_QUERY_MAX_LENGTH"
        :placeholder="phrase.search_placeholder"
        :aria-label="phrase.search_placeholder"
        class="search-input h-16 w-full rounded-normal border-2 border-border-1
          bg-bg-1/80 pr-14 pl-14 text-lg font-semibold shadow-lg shadow-shadow-1
          backdrop-blur-sm transition outline-none placeholder:font-normal
          placeholder:text-text-3 focus:border-accent/60 sm:text-xl
          hocus:border-border-2"
      />
      <button
        v-if="text"
        type="button"
        class="absolute top-1/2 right-xs flex size-10 -translate-y-1/2
          cursor-pointer items-center justify-center rounded-sm text-xl
          text-text-3 transition focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none hocus:bg-bg-3 hocus:text-text-1"
        :aria-label="phrase.search_clear"
        :data-title-popup="phrase.search_clear"
        @click="clearText"
      >
        <Icon name="close" />
      </button>
    </form>

    <div
      class="grid min-w-0 items-start gap-md
        sm:grid-cols-[minmax(0,1fr)_minmax(15rem,16rem)] sm:gap-lg"
    >
      <section class="flex min-w-0 flex-col gap-sm" aria-live="polite">
        <div class="flex min-h-6 items-center gap-xs text-sm text-text-3">
          <span>{{
            phrase.search_results_count(
              search.totals.project,
              search.totals.event,
            )
          }}</span>
          <Icon
            v-if="pending"
            name="loading"
            class="text-base"
            aria-hidden="true"
          />
        </div>
        <div
          v-if="search.items.length"
          class="flex flex-col gap-sm transition-opacity"
          :class="{ 'opacity-60': pending }"
        >
          <PublicSearchResult
            v-for="item in search.items"
            :key="item.href"
            :entity="item"
          />
        </div>
        <PublicEmptyState
          v-else
          :title="phrase.search_empty"
          :description="phrase.search_empty_description"
        />
        <PublicPagination :page="search.page" :page-count="search.pageCount" />
      </section>

      <aside
        class="sticky top-(--public-anchor-offset) hidden min-w-0 self-start
          sm:block"
        :aria-label="phrase.search_filters"
      >
        <PublicSearchFilters
          :filters="filters"
          :tags="search.tags"
          @change="applyFilters"
        />
      </aside>
    </div>

    <PublicSheet
      :title="phrase.search_filters"
      icon="tune"
      @open="sheetOpen = true"
      @close="commitDraft"
    >
      <template #summary>
        <span
          v-if="activeFilterCount"
          class="rounded-full bg-accent px-2 text-xs leading-5 font-bold
            text-white tabular-nums"
        >
          {{ activeFilterCount }}
        </span>
      </template>
      <div class="p-sm">
        <PublicSearchFilters
          :filters="filters"
          :tags="search.tags"
          @change="applyFilters"
        />
      </div>
    </PublicSheet>
  </main>
</template>

<style scoped>
.search-input::-webkit-search-cancel-button {
  appearance: none;
}
</style>
