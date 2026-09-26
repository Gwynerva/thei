<script lang="ts" setup>
import { buildPaginationItems } from '#layers/thei/shared/pagination';
import TheiLink from './TheiLink';

const props = defineProps<{
  page: number;
  pageCount: number;
  /** Whether the list is being loaded. */
  pending: boolean;
}>();

const route = useRoute();

const items = computed(() => buildPaginationItems(props.page, props.pageCount));

const arrows = computed(
  () =>
    [
      { kind: 'previous', page: props.page - 1, disabled: props.page <= 1 },
      {
        kind: 'next',
        page: props.page + 1,
        disabled: props.page >= props.pageCount,
      },
    ] as const,
);

// Every link here leads to this very path, and RouterLink marks each of them
// as the current page whatever its query, so every link sets `aria-current`
// itself, the arrows included.
function pageTo(page: number) {
  const query = { ...route.query };
  if (page <= 1) delete query.page;
  else query.page = String(page);
  // The path goes along: rebuilt from the route's pattern, the address would
  // lose its trailing slash.
  return { path: route.path, query };
}

type ControlKey = number | 'previous' | 'next';

/**
 * The page a click asked for and the control that asked, until the page has
 * arrived. The control shows the wait in place of its own content, right
 * where the reader is looking, and nothing around it moves.
 */
const requested = ref<{ page: number; key: ControlKey }>();

function request(page: number, key: ControlKey, event: MouseEvent) {
  // A modified click opens the page elsewhere and leaves this one in place.
  if (
    page === props.page ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  requested.value = { page, key };
}

// The same page with another query keeps its scroll position, so a reader who
// paged at the bottom of a list would land at the bottom of the next one. Like
// a page load, the next page starts at the top — once it has rendered, so the
// old list never jumps. Moving through history is left to the browser.
watch(
  () => [props.page, props.pending] as const,
  ([page, pending], [, wasPending]) => {
    if (!requested.value) return;
    if (page === requested.value.page) {
      requested.value = undefined;
      window.scrollTo({ top: 0 });
    } else if (wasPending && !pending) {
      // The load is over without the page: it failed, or the list shrank.
      requested.value = undefined;
    }
  },
  { flush: 'post' },
);
</script>

<template>
  <nav
    v-if="pageCount > 1"
    class="flex flex-wrap items-center justify-center gap-xs"
    :aria-label="phrase.pagination"
    :aria-busy="requested ? 'true' : undefined"
  >
    <template v-for="arrow in arrows" :key="arrow.kind">
      <div
        v-if="arrow.kind === 'next'"
        class="flex h-8 divide-x divide-border-1 overflow-hidden rounded-normal
          border border-border-1 bg-bg-2 text-sm tabular-nums sm:h-9"
      >
        <template v-for="item in items" :key="item">
          <span
            v-if="typeof item !== 'number'"
            class="flex min-w-8 items-center justify-center text-text-3
              sm:min-w-9"
            aria-hidden="true"
          >
            …
          </span>
          <TheiLink
            v-else
            :to="pageTo(item)"
            class="relative flex min-w-8 items-center justify-center px-0.5
              transition sm:min-w-9"
            :class="
              item === page
                ? `bg-bg-accent text-accent ring-1 ring-accent ring-inset
                  first:rounded-l-normal last:rounded-r-normal`
                : 'text-text-2 hocus:bg-bg-3 hocus:text-text-1'
            "
            :aria-current="item === page ? 'page' : undefined"
            :aria-label="phrase.page_of(item, pageCount)"
            @click="request(item, item, $event)"
          >
            <!-- The number keeps its place, so the cell keeps its width. -->
            <span :class="{ invisible: requested?.key === item }">
              {{ item }}
            </span>
            <Icon
              v-if="requested?.key === item"
              name="loading"
              class="absolute"
            />
          </TheiLink>
        </template>
      </div>
      <component
        :is="arrow.disabled ? 'button' : TheiLink"
        :to="arrow.disabled ? undefined : pageTo(arrow.page)"
        :type="arrow.disabled ? 'button' : undefined"
        :disabled="arrow.disabled"
        class="flex size-8 items-center justify-center rounded-normal border
          border-border-1 bg-bg-2 text-base transition sm:size-9"
        :class="
          arrow.disabled
            ? 'text-text-3'
            : `text-text-2 hocus:border-border-3 hocus:bg-bg-3
              hocus:text-text-1`
        "
        :aria-current="undefined"
        :aria-label="phrase[arrow.kind]"
        @click="arrow.disabled || request(arrow.page, arrow.kind, $event)"
      >
        <Icon
          :name="
            requested?.key === arrow.kind
              ? 'loading'
              : arrow.kind === 'previous'
                ? 'chevron-left'
                : 'chevron-right'
          "
        />
      </component>
    </template>
  </nav>
</template>
