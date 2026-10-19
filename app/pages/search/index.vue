<script lang="ts" setup>
import {
  SEARCH_KINDS,
  type SearchKind,
  type SearchResponse,
} from '#layers/thei/shared/search/api';
import {
  countPublicSearchFilters,
  parsePublicSearchFilters,
  PUBLIC_SEARCH_DEBOUNCE_MS,
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
  publicSearchPreset,
  publicSearchPresetHref,
  publicSearchQuery,
  type PublicSearchFilters,
  type PublicSearchPresetId,
} from '#layers/thei/shared/public-search';

/**
 * The search page. Without a query it is the catalogue of projects and
 * events, with its presets; with one, what was found across the site,
 * grouped by kind — the best three of each and the way to all of them —
 * with chips that count and choose the kinds, and the years and tags the
 * results fall in beside.
 */
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
// Read as the quick search reads it, the last word as the start of one, so
// the two find the same and count it alike.
const request = computed(() => {
  const query = publicSearchQuery(
    filters.value,
    draft.value ? 1 : parsed.value.page,
  );
  return query.q ? { ...query, typing: '1' } : query;
});
const resource = await useFetch<SearchResponse>('/api/search', {
  query: request,
});
if (resource.error.value) throw createResourceError(resource.error.value);
if (!resource.data.value)
  throw createResourceError({
    statusCode: 502,
    statusMessage: 'Empty API response',
  });

// A search that fails while typing keeps what was found before: too many at
// once waits as long as it was told to and asks again.
let held: SearchResponse = resource.data.value;
const search = computed(() => {
  if (resource.data.value) held = resource.data.value;
  return held;
});
const failed = ref(false);
let retry: ReturnType<typeof setTimeout> | undefined;
watch(resource.error, (error) => {
  clearTimeout(retry);
  failed.value = false;
  if (!error) return;
  const status = (error as { statusCode?: number }).statusCode;
  if (status === 429) retry = setTimeout(() => void resource.refresh(), 1500);
  else failed.value = true;
});
onBeforeUnmount(() => clearTimeout(retry));

const pending = computed(() => resource.status.value === 'pending');
const typed = computed(() => Boolean(search.value.query));
// With a query, the kind is the chips' choice, shown on them, not a filter
// the sheet counts.
const activeFilterCount = computed(
  () =>
    countPublicSearchFilters(filters.value) -
    (filters.value.q.trim() && filters.value.type ? 1 : 0),
);
const hasCriteria = computed(
  () => Boolean(filters.value.q.trim()) || activeFilterCount.value > 0,
);

// Result pages stay out of the index: search engines treat internal search
// results as thin content. The query only makes the tab and a shared link
// readable.
const seoQuery = computed(() => filters.value.q.trim());

/**
 * A few filter combinations are pages of the site rather than searches — the
 * list of projects, the résumé — and those are worth indexing, with a name of
 * their own and no mention of searching anywhere.
 */
const preset = computed(() =>
  publicSearchPreset(filters.value, parsed.value.page),
);
const presetTitles: Record<PublicSearchPresetId, () => string> = {
  all: () => phrase.value.search_preset_all_title,
  projects: () => phrase.value.search_preset_projects_title,
  events: () => phrase.value.search_preset_events_title,
  showcase: () => phrase.value.search_preset_showcase_title,
  cv: () => phrase.value.search_preset_cv_title,
};
const presetDescriptions: Record<PublicSearchPresetId, () => string> = {
  all: () => phrase.value.search_preset_all_description,
  projects: () => phrase.value.search_preset_projects_description,
  events: () => phrase.value.search_preset_events_description,
  showcase: () => phrase.value.search_preset_showcase_description,
  cv: () => phrase.value.search_preset_cv_description,
};
const ogImage = useOgImage(() => ({
  kind: 'service',
  id: !preset.value || preset.value.id === 'all' ? 'search' : preset.value.id,
}));
usePublicSeo({
  ogImage,
  title: () => {
    if (preset.value) return presetTitles[preset.value.id]();
    return seoQuery.value
      ? `${phrase.value.public_search_query_title(seoQuery.value)} - ${phrase.value.search}`
      : phrase.value.search;
  },
  description: () => {
    if (preset.value) return presetDescriptions[preset.value.id]();
    return seoQuery.value
      ? phrase.value.public_search_query_description(seoQuery.value)
      : phrase.value.public_search_description;
  },
  canonical: () =>
    preset.value ? publicSearchPresetHref(preset.value) : '/search/',
  noIndex: () => hasCriteria.value && !preset.value,
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

// ---- With a query --------------------------------------------------------

/** The kinds found, each with its count, and «everything» before them. */
const kindChips = computed(() => {
  const kinds = search.value.facets.kinds;
  const all = SEARCH_KINDS.reduce((sum, kind) => sum + (kinds[kind] ?? 0), 0);
  return [
    { kind: undefined, label: phrase.value.search_type_all, count: all },
    ...SEARCH_KINDS.filter(
      (kind) => kinds[kind] || filters.value.type === kind,
    ).map((kind) => ({
      kind,
      label: phrase.value.search_kind_group(kind),
      count: kinds[kind] ?? 0,
    })),
  ];
});

function chooseKind(kind: SearchKind | undefined) {
  void applyFilters({
    type: kind,
    // The showcase and the résumé hold projects only.
    ...(kind === 'project' ? {} : { showcase: false, cv: false }),
  });
}

const building = computed(() => {
  const state = search.value.building;
  return state && state.total
    ? Math.min(99, Math.floor((state.done / state.total) * 100))
    : undefined;
});

/**
 * How many the catalogue holds. A search says it on its chips, which count
 * every kind and the whole.
 */
const countLine = computed(() => {
  const { type, showcase, cv } = filters.value;
  const kinds = search.value.facets.kinds;
  if (type === 'project' || showcase || cv)
    return phrase.value.search_results_count(search.value.total, 0);
  if (type === 'event')
    return phrase.value.search_results_count(0, search.value.total);
  return phrase.value.search_results_count(
    kinds.project ?? 0,
    kinds.event ?? 0,
  );
});
</script>

<template>
  <main
    class="m-auto flex w-(--width-wide) flex-col gap-sm px-window pt-sm
      pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:gap-lg sm:py-lg"
  >
    <h1 class="sr-only">{{ phrase.search }}</h1>
    <form role="search" class="group relative" @submit.prevent="commitText">
      <Icon
        name="search"
        class="pointer-events-none absolute top-1/2 left-3 z-1 -translate-y-1/2
          text-base text-text-3 transition group-focus-within:text-accent
          sm:left-4 sm:text-2xl"
      />
      <input
        ref="input"
        v-model="text"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        data-search-page-field
        :maxlength="PUBLIC_SEARCH_QUERY_MAX_LENGTH"
        :placeholder="phrase.search_placeholder"
        :aria-label="phrase.search_placeholder"
        class="search-input h-12 w-full rounded-normal border-2 border-border-1
          bg-bg-1/80 pr-10.5 pl-10.5 text-base font-semibold shadow-lg
          shadow-shadow-1 backdrop-blur-sm transition outline-none
          placeholder:font-normal placeholder:text-text-3 focus:border-accent/60
          sm:h-16 sm:pr-14 sm:pl-15 sm:text-xl hocus:border-border-2"
      />
      <button
        v-if="text"
        type="button"
        class="absolute top-1/2 right-0.5 flex size-10 -translate-y-1/2
          cursor-pointer items-center justify-center rounded-sm text-xl
          text-text-3 transition focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none sm:right-2.5 hocus:bg-bg-3
          hocus:text-text-1"
        :aria-label="phrase.search_clear"
        :data-title-popup="phrase.search_clear"
        @click="clearText"
      >
        <Icon name="close" />
      </button>
    </form>

    <nav
      v-if="typed && search.total"
      class="-mx-window flex scrollbar-hover gap-xs overflow-x-auto px-window
        max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]
        sm:mx-0 sm:flex-wrap sm:px-0"
      :aria-label="phrase.search_filter_type"
    >
      <button
        v-for="chip in kindChips"
        :key="chip.kind ?? 'all'"
        type="button"
        :aria-pressed="filters.type === chip.kind"
        class="inline-flex shrink-0 cursor-pointer items-center gap-1.5
          rounded-full border px-sm py-1 text-sm font-semibold transition
          focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none"
        :class="
          filters.type === chip.kind
            ? 'border-accent/50 bg-bg-accent text-accent'
            : `border-border-1 bg-bg-1/60 text-text-2 hocus:border-border-2
              hocus:text-text-1`
        "
        @click="chooseKind(chip.kind)"
      >
        <Icon
          v-if="chip.kind"
          :name="SEARCH_KIND_ICONS[chip.kind]"
          class="shrink-0 opacity-50"
          aria-hidden="true"
        />
        {{ chip.label }}
        <span class="text-xs font-normal text-text-3 tabular-nums">{{
          chip.count
        }}</span>
      </button>
      <Icon
        v-if="pending"
        name="loading"
        class="shrink-0 self-center text-base text-text-3"
        aria-hidden="true"
      />
    </nav>

    <div
      class="grid min-w-0 items-start gap-md
        sm:grid-cols-[minmax(0,1fr)_minmax(15rem,16rem)] sm:gap-lg"
    >
      <section class="flex min-w-0 flex-col gap-sm" aria-live="polite">
        <div
          v-if="!typed || failed"
          class="flex min-h-6 flex-wrap items-center gap-x-xs gap-y-0.5 text-sm
            text-text-3"
        >
          <span v-if="!typed">{{ countLine }}</span>
          <Icon
            v-if="pending && !typed"
            name="loading"
            class="text-base"
            aria-hidden="true"
          />
          <span v-if="failed" class="text-text-error">{{
            phrase.search_failed
          }}</span>
        </div>
        <p v-if="search.keyboard" class="text-sm text-text-2">
          {{ phrase.search_keyboard(search.keyboard) }}
        </p>
        <p v-if="search.partial" class="text-sm text-text-2">
          {{ phrase.search_partial }}
        </p>
        <p
          v-if="building !== undefined"
          class="flex items-center gap-xs text-sm text-text-2"
        >
          <Icon name="loading" class="shrink-0" aria-hidden="true" />
          {{ phrase.search_building(building) }}
        </p>

        <div
          v-if="search.groups.length"
          class="flex flex-col gap-md transition-opacity"
          :class="{ 'opacity-60': pending }"
        >
          <section
            v-for="group in search.groups"
            :key="group.kind"
            class="flex flex-col gap-sm"
            :aria-label="phrase.search_kind_group(group.kind)"
          >
            <h2
              v-if="typed && !filters.type"
              class="text-base font-bold tracking-wider text-text-3 uppercase"
            >
              {{ phrase.search_kind_group(group.kind) }}
            </h2>
            <SearchResultCard
              v-for="hit in group.hits"
              :key="hit.ref"
              :hit
              :query="search.keyboard ?? search.query"
              :opened="route.query.open === hit.ref"
            />
            <button
              v-if="typed && !filters.type && group.total > group.hits.length"
              type="button"
              class="inline-flex cursor-pointer items-center gap-1 self-start
                rounded-sm px-xs py-1 text-sm font-semibold text-accent
                transition focus-visible:ring-2 focus-visible:ring-accent
                focus-visible:outline-none hocus:bg-accent/10"
              @click="chooseKind(group.kind)"
            >
              {{ phrase.search_all_of_kind(group.total) }}
              <Icon name="chevron-right" aria-hidden="true" />
            </button>
          </section>
        </div>
        <PublicEmptyState
          v-else-if="!pending"
          :title="phrase.search_empty"
          :description="phrase.search_empty_description"
        />
        <Pagination
          v-if="!typed || filters.type"
          :page="search.page"
          :page-count="search.pageCount"
          :pending
        />
      </section>

      <PublicStickyAside :aria-label="phrase.search_filters">
        <PublicSearchFilters
          :filters
          :tags="search.facets.tags"
          :years="typed ? search.facets.years : undefined"
          :query="typed"
          @change="applyFilters"
        />
      </PublicStickyAside>
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
          :filters
          :tags="search.facets.tags"
          :years="typed ? search.facets.years : undefined"
          :query="typed"
          @change="applyFilters"
        />
      </div>
      <!-- What is chosen shows behind the sheet as it is chosen; this takes
           the reader to it, as closing does, in words. -->
      <div
        class="sticky bottom-0 border-t border-border-1 bg-bg-2 p-sm
          pb-[calc(var(--spacing-sm)+env(safe-area-inset-bottom))]"
      >
        <Button variant="primary" class="w-full" @click="closeModal()">
          {{ phrase.search_show_results(search.total) }}
        </Button>
      </div>
    </PublicSheet>
  </main>
</template>

<style scoped>
.search-input::-webkit-search-cancel-button {
  appearance: none;
}
</style>
