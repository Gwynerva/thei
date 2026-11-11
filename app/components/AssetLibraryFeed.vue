<script setup lang="ts">
import type { AssetType } from '#layers/thei/shared/asset';
import {
  ASSET_LIBRARY_FEED_PAGE,
  assetLibraryWhereQuery,
  type AssetLibraryEntry,
  type AssetLibraryFacets,
  type AssetLibraryFeedResponse,
  type AssetLibraryHere,
  type AssetLibraryItem,
  type AssetLibraryOrder,
  type AssetLibraryPlace,
  type AssetLibraryWhere,
  type AssetSelectionConstraints,
} from '#layers/thei/shared/asset-library';
import {
  assetDeletionLabel,
  assetRoleLabel,
  assetSourceTitle,
  assetUseLabel,
} from '../composables/asset-library-labels';
import {
  libraryFeedMonths,
  libraryFeedNamed,
  libraryFeedNewEntries,
} from '../composables/asset-library-feed';

/**
 * The file library as one run through time, the same in the picker that
 * reuses a file and on the storage page: files in their places, the places by
 * their days — a diary entry's own, an event's first, a section's — the
 * newest first unless `order` says otherwise, under a heading per month.
 * While nothing is typed, what is being edited (`here`) and what was used
 * lately stand above the run. It loads as it is scrolled, both ways, and a
 * year in its bar starts it at that year.
 *
 * What the selection cannot take by its kind is never listed; a file too
 * large still is, with its warning, since a smaller variant can be made of
 * it. A tile is chosen by a click or Enter and looked at by Space; the arrows
 * walk the tiles. Where a file can be taken otherwise (`editable`), a button
 * on its tile opens the editor instead (`edit`). The month in view and the
 * years of the run stay in one bar stuck at the top.
 */
const props = defineProps<{
  constraints?: AssetSelectionConstraints;
  here?: AssetLibraryHere;
  /** The files chosen so far; unset where files are not chosen. */
  selected?: string[];
  busy?: boolean;
  /** Where the bar of the month and the years sticks, under whatever sticks above it. */
  stickyTop?: string;
  /** The surface the run lies on, which the sticky bar is drawn in. */
  ground?: 'page' | 'box';
  /**
   * How far the bar reaches beyond the run on either side, and how far its
   * contents keep in from that edge: to the edges of the window or the box
   * the run lies in.
   */
  bleed?: string;
  /** Whether a file can be taken otherwise than as it is: a button opens the editor. */
  editable?: boolean;
  /** The search takes the focus as the run opens: in a picker, made to be typed in. */
  autofocus?: boolean;
  /** The kinds of file the selection can take; every kind when unset. */
  kinds?: AssetType[];
}>();
const emit = defineEmits<{
  choose: [item: AssetLibraryItem];
  edit: [item: AssetLibraryItem];
  preview: [item: AssetLibraryItem];
}>();
const search = defineModel<string>('search', { required: true });
const type = defineModel<AssetType | ''>('type', { required: true });
const where = defineModel<AssetLibraryWhere>('where', { required: true });
const order = defineModel<AssetLibraryOrder>('order', { required: true });

const root = shallowRef<HTMLElement>();
const searchInput = shallowRef<HTMLInputElement>();
const entries = shallowRef<AssetLibraryEntry[]>([]);
/** Where `entries` start in the whole run. */
const start = ref(0);
/**
 * Where what was fetched ends in the whole run: a repeat left out of
 * `entries` counts here all the same, so the next answer starts after it.
 */
const reached = ref(0);
const total = ref(0);
const facets = ref<AssetLibraryFacets>();
const years = ref<{ year: string; count: number }[]>([]);
const hereEntries = shallowRef<AssetLibraryEntry[]>([]);
const recent = shallowRef<AssetLibraryItem[]>([]);
const loading = ref<'head' | 'before' | 'after' | undefined>();
const error = ref(false);
const currentYear = ref<string>();
/** The month at the top of the view, `YYYY-MM`, or empty for no day. */
const currentMonth = ref<string>();
const bar = shallowRef<HTMLElement>();
const yearStrip = shallowRef<HTMLElement>();
const query = ref(search.value.trim());
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let generation = 0;

const selectedSet = computed(() =>
  props.selected ? new Set(props.selected) : undefined,
);

/**
 * The reader's clock, in minutes ahead of UTC: the library dates uploads by
 * the reader's days, and counts «вчера» from the reader's today.
 */
function utcOffset() {
  return -new Date().getTimezoneOffset();
}
function requestQuery() {
  const c = props.constraints ?? {};
  return {
    acceptedExtensions:
      c.acceptedExtensions === '*'
        ? '*'
        : c.acceptedExtensions
          ? JSON.stringify(c.acceptedExtensions)
          : undefined,
    maxSize: c.maxSize,
    sizeLimitPolicy: c.sizeLimitPolicy,
    imageOnly: c.imageOnly || undefined,
    ...assetLibraryWhereQuery(where.value),
    q: query.value || undefined,
    type: type.value || undefined,
    order: order.value,
    here: props.here ? `${props.here.type}:${props.here.id}` : undefined,
    utcOffset: utcOffset(),
  };
}
function fetchFeed(extra: Record<string, string | number>) {
  return $fetch<AssetLibraryFeedResponse>('/api/admin/assets/feed', {
    query: { ...requestQuery(), ...extra },
    signal: controller?.signal,
  });
}

/** The run from its start, or from the first place of `year`. */
async function reset(year?: string) {
  controller?.abort();
  controller = new AbortController();
  const current = ++generation;
  loading.value = 'head';
  error.value = false;
  try {
    const result = await fetchFeed({ head: 1, ...(year ? { year } : {}) });
    if (current !== generation) return;
    entries.value = result.entries;
    start.value = result.offset;
    reached.value = result.offset + result.entries.length;
    total.value = result.total;
    facets.value = result.facets;
    years.value = result.years ?? [];
    hereEntries.value = result.here ?? [];
    recent.value = result.recent ?? [];
    await nextTick();
    currentMonth.value = undefined;
    currentYear.value = year ?? result.entries[0]?.place.date?.slice(0, 4);
    if (year) requestAnimationFrame(readCurrent);
    const scroller = scrollRoot();
    if (year) {
      const heading =
        root.value?.querySelector<HTMLElement>('[data-feed-month]');
      if (heading) scrollToElement(heading);
    } else if (scroller && root.value) {
      // A new search starts at its top, under the search itself.
      const top = root.value.getBoundingClientRect().top;
      if (top < 0) scrollToElement(root.value);
    }
  } catch {
    if (current === generation && !controller.signal.aborted)
      error.value = true;
  } finally {
    if (current === generation) loading.value = undefined;
  }
}

/** The next places of the run, or the ones before what is shown. */
async function extend(direction: 'before' | 'after') {
  if (loading.value) return;
  const end = reached.value;
  if (direction === 'after' && end >= total.value) return;
  if (direction === 'before' && start.value === 0) return;
  const current = generation;
  loading.value = direction;
  try {
    const offset =
      direction === 'after'
        ? end
        : Math.max(0, start.value - ASSET_LIBRARY_FEED_PAGE);
    const result = await fetchFeed({ offset });
    if (current !== generation) return;
    if (direction === 'after') {
      // The run may have moved since: what came again is not shown twice.
      entries.value = [
        ...entries.value,
        ...libraryFeedNewEntries(entries.value, result.entries),
      ];
      reached.value = offset + result.entries.length;
    } else {
      // What is above the shown part grows without moving what is in view.
      const anchor = root.value?.querySelector<HTMLElement>('[data-feed-tile]');
      const before = anchor?.getBoundingClientRect().top ?? 0;
      entries.value = [
        ...libraryFeedNewEntries(
          entries.value,
          result.entries.slice(0, start.value - offset),
        ),
        ...entries.value,
      ];
      start.value = offset;
      await nextTick();
      const after = anchor?.getBoundingClientRect().top ?? 0;
      scrollBy(after - before);
    }
    total.value = result.total;
  } catch {
    if (current === generation) error.value = true;
  } finally {
    if (current === generation) loading.value = undefined;
  }
}

/** The element the run scrolls in: the modal's body, or the page. */
function scrollRoot(): HTMLElement | undefined {
  let node = root.value?.parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
    node = node.parentElement;
  }
  return undefined;
}
function scrollBy(delta: number) {
  if (!delta) return;
  const scroller = scrollRoot();
  if (scroller) scroller.scrollTop += delta;
  else window.scrollBy(0, delta);
}
/** Where the bottom of the stuck bar is, as the view sees it. */
function barBottom() {
  const scroller = scrollRoot();
  const top =
    (scroller?.getBoundingClientRect().top ?? 0) +
    (bar.value ? parseFloat(getComputedStyle(bar.value).top) || 0 : 0);
  return top + (bar.value?.offsetHeight ?? 0);
}
/** Brings an element up to just under the stuck bar. */
function scrollToElement(element: HTMLElement) {
  const delta = element.getBoundingClientRect().top - barBottom();
  const scroller = scrollRoot();
  if (scroller) scroller.scrollTop += delta;
  else window.scrollBy(0, delta);
}

/** The month, and so the year, whose places are at the top of the view. */
function readCurrent() {
  // The month in view is the last whose heading has reached the bar; the
  // bar names it once that heading has gone under it whole, never while the
  // heading still shows right below.
  const line = barBottom() + 1;
  let reached: HTMLElement | undefined;
  let below: string | undefined;
  for (const heading of root.value?.querySelectorAll<HTMLElement>(
    '[data-feed-month]',
  ) ?? []) {
    if (heading.getBoundingClientRect().top > line) {
      below = heading.dataset.feedMonth;
      break;
    }
    reached = heading;
  }
  const month = reached?.dataset.feedMonth;
  const under = reached && reached.getBoundingClientRect().bottom <= line;
  currentMonth.value = !under ? undefined : month === 'undated' ? '' : month;
  // The year is that of the month in view, or of the heading coming next.
  const year = (month ?? below)?.slice(0, 4);
  currentYear.value = year && /^\d{4}$/.test(year) ? year : undefined;
}
let frame = 0;
function onScroll() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(readCurrent);
}
// The year in view stands in the middle of its strip, as far as it can.
watch(currentYear, async (year) => {
  await nextTick();
  const strip = yearStrip.value;
  const button = strip?.querySelector<HTMLElement>(`[data-year="${year}"]`);
  if (!strip || !button) return;
  strip.scrollTo({
    left: button.offsetLeft + button.offsetWidth / 2 - strip.clientWidth / 2,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  });
});

function jumpTo(year: string) {
  const heading = root.value?.querySelector<HTMLElement>(
    `[data-feed-month^="${year}"]`,
  );
  if (heading && start.value === 0) {
    scrollToElement(heading);
    currentYear.value = year;
  } else void reset(year);
}

/** The places the search names, each with its files, before the run. */
const named = computed(() => libraryFeedNamed(entries.value));
const months = computed(() => libraryFeedMonths(entries.value));

function monthLabel(key: string) {
  if (!key) return phrase.value.asset_library_undated;
  const date = new Date(`${key}-01T00:00:00Z`);
  const month = new Intl.DateTimeFormat(language.value.code, {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return `${month.charAt(0).toLocaleUpperCase(language.value.code)}${month.slice(1)} ${key.slice(0, 4)}`;
}

function tileTitle(
  item: AssetLibraryItem | AssetLibraryEntry,
  place?: AssetLibraryPlace,
) {
  return [
    place && place.type !== 'unused' ? assetSourceTitle(place) : undefined,
    item.roles
      .map((role) =>
        // In a place, a text is named as that place's: «Section text».
        'place' in item
          ? assetUseLabel(role, item.place.type)
          : assetRoleLabel(role),
      )
      .join(' · '),
    item.selectionError === 'size'
      ? phrase.value.asset_selection_size
      : undefined,
    item.deleteAfter ? assetDeletionLabel(item.deleteAfter) : undefined,
    item.inHistory ? phrase.value.asset_library_in_history : undefined,
    item.heldByAi ? phrase.value.asset_library_held_by_ai : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The arrows walk the tiles as they lie; Space looks at one. */
function onTileKey(event: KeyboardEvent, item: AssetLibraryItem) {
  if (event.key === ' ') {
    event.preventDefault();
    emit('preview', item);
    return;
  }
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (!keys.includes(event.key) || !root.value) return;
  event.preventDefault();
  const tiles = [
    ...root.value.querySelectorAll<HTMLElement>('[data-feed-tile]'),
  ];
  const from = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-feed-tile]',
  )!;
  const at = tiles.indexOf(from);
  let next: HTMLElement | undefined;
  if (event.key === 'ArrowLeft') next = tiles[at - 1];
  else if (event.key === 'ArrowRight') next = tiles[at + 1];
  else {
    const box = from.getBoundingClientRect();
    const down = event.key === 'ArrowDown';
    const row = (down ? tiles.slice(at + 1) : tiles.slice(0, at).reverse())
      .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
      .filter(({ box: other }) =>
        down ? other.top > box.top + 2 : other.top < box.top - 2,
      );
    const lineTop = row[0]?.box.top;
    next = row
      .filter(({ box: other }) => Math.abs(other.top - lineTop!) < 2)
      .sort(
        (a, b) =>
          Math.abs(a.box.left - box.left) - Math.abs(b.box.left - box.left),
      )[0]?.tile;
    if (!next && event.key === 'ArrowUp') searchInput.value?.focus();
  }
  next?.focus();
  next?.scrollIntoView({ block: 'nearest' });
}
function onSearchKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown') return;
  const first = root.value?.querySelector<HTMLElement>('[data-feed-tile]');
  if (!first) return;
  event.preventDefault();
  first.focus();
}
watch(searchInput, (input, previous) => {
  previous?.removeEventListener('keydown', onSearchKey);
  input?.addEventListener('keydown', onSearchKey);
});

const sentinelBefore = shallowRef<HTMLElement>();
const sentinelAfter = shallowRef<HTMLElement>();
let observer: IntersectionObserver | undefined;
function observe() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (seen) => {
      for (const each of seen) {
        if (!each.isIntersecting) continue;
        void extend(each.target === sentinelBefore.value ? 'before' : 'after');
      }
    },
    { root: scrollRoot() ?? null, rootMargin: '800px 0px' },
  );
  for (const sentinel of [sentinelBefore.value, sentinelAfter.value])
    if (sentinel) observer.observe(sentinel);
}
watch([sentinelBefore, sentinelAfter], () => observe());
// A load that ends with its sentinel still in view asks for the next.
watch(loading, (value) => {
  if (value) return;
  void nextTick(() => observe());
});

watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (query.value === value.trim()) return;
    query.value = value.trim();
    void reset();
  }, 250);
});
watch([type, where, order], () => void reset());

let scroller: HTMLElement | Window | undefined;
let focusTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  scroller = scrollRoot() ?? window;
  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (props.autofocus) {
    searchInput.value?.focus({ preventScroll: true });
    // A modal hands the focus to its dialog once its new layer is on top;
    // the search takes it back, unless something of the run holds it.
    focusTimer = setTimeout(() => {
      if (!root.value?.contains(document.activeElement))
        searchInput.value?.focus({ preventScroll: true });
    }, 350);
  }
  void reset();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearTimeout(focusTimer);
  controller?.abort();
  observer?.disconnect();
  cancelAnimationFrame(frame);
  scroller?.removeEventListener('scroll', onScroll);
  searchInput.value?.removeEventListener('keydown', onSearchKey);
});
defineExpose({ reset });

/** Whether the run covers more than one year, which the bar is for. */
const manyYears = computed(
  () => years.value.filter((each) => each.year).length > 1,
);
const filtered = computed(
  () => Boolean(query.value) || where.value !== 'all' || Boolean(type.value),
);
function clearSearch() {
  clearTimeout(timer);
  search.value = '';
  query.value = '';
  type.value = '';
  where.value = 'all';
}
</script>

<template>
  <div ref="root" class="flex flex-col gap-sm" data-library-feed>
    <AssetLibrarySearch
      v-model:search="search"
      v-model:type="type"
      v-model:where="where"
      v-model:order="order"
      :facets
      :kinds
      @element="searchInput = $event"
    />
    <slot name="notice" />

    <!-- What is here and what was used lately, while nothing is typed. -->
    <template v-if="!query && start === 0">
      <section
        v-for="strip in [
          {
            id: 'here',
            icon: 'gallery' as const,
            title: phrase.asset_library_here,
            items: hereEntries,
          },
          {
            id: 'recent',
            icon: 'history' as const,
            title: phrase.asset_library_recent,
            items: recent,
          },
        ].filter((each) => each.items.length)"
        :key="strip.id"
        :data-feed-strip="strip.id"
        class="flex flex-col gap-xs"
      >
        <h3
          class="flex items-center gap-1 text-2xs font-semibold tracking-wide
            text-text-2 uppercase"
        >
          <Icon :name="strip.icon" class="shrink-0" />{{ strip.title }}
        </h3>
        <div
          class="grid grid-cols-3 gap-xs
            sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]"
        >
          <AssetLibraryFeedTile
            v-for="item in strip.items"
            :key="item.asset.assetUuid"
            :item
            :selected="selectedSet?.has(item.asset.assetUuid)"
            :busy
            :editable
            :title="tileTitle(item, 'place' in item ? item.place : undefined)"
            @choose="emit('choose', item)"
            @edit="emit('edit', item)"
            @key="onTileKey($event, item)"
          />
        </div>
      </section>
    </template>

    <!-- The places the search names, before the run through time: what a
         search by a name most likely means. -->
    <section v-if="named.length" class="flex flex-col gap-xs" data-feed-named>
      <h3
        class="flex items-center gap-1 text-2xs font-semibold tracking-wide
          text-text-2 uppercase"
      >
        <Icon name="search" class="shrink-0" />{{ phrase.asset_library_named }}
      </h3>
      <AssetLibraryFeedPlace
        v-for="group in named"
        :key="group.key"
        :place-key="group.key"
        :place="group.place"
        :entries="group.entries"
        :selected="selectedSet"
        :busy
        :editable
        :title-of="(item) => tileTitle(item)"
        @choose="emit('choose', $event)"
        @edit="emit('edit', $event)"
        @key="onTileKey"
      />
    </section>

    <!-- Only for a run over more than one year: with one, the month headings
         in the run say all there is. The month at the top of the view and
         the years of the run, stuck
         right under whatever sticks above: a click on a year starts the
         run at it, and the year in view keeps to the middle of its strip. -->
    <div
      v-if="entries.length && manyYears"
      ref="bar"
      class="sticky z-20 flex min-w-0 items-center gap-sm border-b
        border-border-1 py-sm"
      :class="[ground === 'box' ? 'bg-bg-2' : 'bg-bg-1', bleed ?? '-mx-1 px-1']"
      :style="{ top: stickyTop ?? '0px' }"
      data-feed-bar
    >
      <span
        v-if="currentMonth !== undefined"
        class="shrink-0 text-sm font-bold tracking-tight"
        data-feed-current-month
        >{{ monthLabel(currentMonth ?? '') }}</span
      >
      <nav
        ref="yearStrip"
        :aria-label="phrase.asset_library_years"
        class="feed-years relative scrollbar-clear min-w-0 flex-1
          overflow-x-auto"
        data-feed-years
      >
        <div class="ml-auto flex w-max gap-0.5 py-0.5">
          <button
            v-for="each in years.filter((one) => one.year)"
            :key="each.year"
            type="button"
            :data-year="each.year"
            class="cursor-pointer rounded-sm px-1.5 py-0.5 text-2xs tabular-nums
              transition-colors pointer-coarse:px-2.5 pointer-coarse:py-2
              pointer-coarse:text-xs hocus:bg-bg-accent hocus:text-accent"
            :class="
              currentYear === each.year
                ? 'bg-bg-accent font-semibold text-accent'
                : 'text-text-2'
            "
            :aria-current="currentYear === each.year ? 'true' : undefined"
            :data-title-popup="String(each.count)"
            @click="jumpTo(each.year)"
          >
            {{ each.year }}
          </button>
        </div>
      </nav>
    </div>

    <div class="min-w-0">
      <div
        v-if="start > 0"
        ref="sentinelBefore"
        class="h-px"
        aria-hidden="true"
      ></div>
      <!-- Takes no room: what loads above must not push what is in view. -->
      <div class="relative h-0">
        <div
          v-if="loading === 'before'"
          role="status"
          class="absolute inset-x-0 top-0 p-sm text-center"
        >
          <Icon name="loading" />
        </div>
      </div>
      <section
        v-for="month in months"
        :key="month.key"
        class="flex flex-col"
        :aria-label="monthLabel(month.key)"
      >
        <h3
          :data-feed-month="month.key || 'undated'"
          class="flex items-baseline gap-xs py-xs"
        >
          <span class="font-bold tracking-tight">{{
            monthLabel(month.key)
          }}</span>
          <span class="text-xs text-text-3 tabular-nums">{{
            month.count
          }}</span>
        </h3>
        <AssetLibraryFeedPlace
          v-for="group in month.places"
          :key="group.id"
          :place-key="group.key"
          :place="group.place"
          :entries="group.entries"
          :selected="selectedSet"
          :busy
          :editable
          :title-of="(item) => tileTitle(item)"
          @choose="emit('choose', $event)"
          @edit="emit('edit', $event)"
          @key="onTileKey"
        />
      </section>

      <EmptyState
        v-if="!loading && !error && !entries.length"
        data-asset-library-empty
        icon="face-dead"
        :title="phrase.asset_library_empty"
        :description="phrase.admin_search_no_results_description"
      >
        <!-- A narrowed search says how to look wider, and how much there
             is anywhere for what was typed. -->
        <template v-if="where !== 'all' || type">
          <span class="text-sm text-text-3"
            >{{ phrase.asset_library_widen }}:</span
          >
          <button
            v-if="where !== 'all'"
            type="button"
            class="inline-flex cursor-pointer items-center gap-1 rounded-full
              border border-border-1 bg-bg-1 py-1 pl-sm text-sm text-text-2
              transition hocus:border-border-3 hocus:text-text-1"
            :class="facets?.anywhere ? 'pr-1.5' : 'pr-sm'"
            @click="where = 'all'"
          >
            <Icon name="globe" class="shrink-0" />{{
              phrase.asset_library_anywhere
            }}<span
              v-if="facets?.anywhere"
              class="rounded-full bg-bg-3 px-2 py-0.5 text-xs leading-none
                tabular-nums"
              >{{ facets.anywhere }}</span
            >
          </button>
          <button
            v-if="type"
            type="button"
            class="inline-flex cursor-pointer items-center gap-1 rounded-full
              border border-border-1 bg-bg-1 px-sm py-1 text-sm text-text-2
              transition hocus:border-border-3 hocus:text-text-1"
            @click="type = ''"
          >
            <Icon name="files" class="shrink-0" />{{ phrase.any_file }}
          </button>
        </template>
        <button
          v-else-if="filtered"
          type="button"
          class="flex cursor-pointer items-center gap-xs rounded-normal border
            border-border-1 bg-bg-1 px-sm py-xs text-sm font-semibold
            text-text-2 transition hocus:border-border-3 hocus:text-text-1"
          @click="clearSearch"
        >
          <Icon name="close" />
          <span>{{ phrase.reset_search }}</span>
        </button>
      </EmptyState>
      <div
        v-if="loading === 'head' || loading === 'after'"
        role="status"
        class="p-md text-center"
      >
        <Icon name="loading" />
      </div>
      <button
        v-else-if="error"
        type="button"
        class="w-full cursor-pointer p-sm text-text-error"
        @click="entries.length ? extend('after') : reset()"
      >
        {{ phrase.failed_to_fetch_data }} · {{ phrase.asset_library_retry }}
      </button>
      <div
        v-if="reached < total"
        ref="sentinelAfter"
        class="h-px"
        aria-hidden="true"
      ></div>
    </div>
  </div>
</template>

<style scoped>
/* The strip of years fades at its ends: more of it lies beyond them. */
.feed-years {
  mask-image: linear-gradient(
    to right,
    transparent,
    black 0.75rem,
    black calc(100% - 0.75rem),
    transparent
  );
}
</style>
