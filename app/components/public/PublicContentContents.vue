<script lang="ts" setup>
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

const { items, active } = defineProps<{
  items: ContentHeading[];
  /** The id of the entry the reader is in (`useActiveContentHeading`). */
  active?: string;
}>();

/**
 * Subheadings in a row stand together along a line of their own, under the
 * section they belong to; while one of them is read, the line lights too.
 */
const groups = computed(() => {
  const result: { key: string; items: ContentHeading[]; sub: boolean }[] = [];
  for (const item of items) {
    const sub = item.level === 3;
    const last = result.at(-1);
    if (sub && last?.sub) last.items.push(item);
    else result.push({ key: item.path, items: [item], sub });
  }
  return result;
});

/** Room kept between the current entry and the edge of what scrolls it. */
const KEEP_IN_SIGHT = 32;
/** How long the reader's own scrolling of the list is left alone. */
const READER_SCROLL_PAUSE = 1000;

const nav = useTemplateRef<HTMLElement>('nav');
let scroller: HTMLElement | undefined;
let readerScrolledAt = 0;

function markReaderScroll() {
  readerScrolledAt = performance.now();
}

/** The nearest box that scrolls the list on its own, never the page. */
function findScroller(from: HTMLElement) {
  for (
    let element = from.parentElement;
    element && element !== document.body;
    element = element.parentElement
  ) {
    const { overflowY } = getComputedStyle(element);
    if (overflowY === 'auto' || overflowY === 'scroll') return element;
  }
  return undefined;
}

/**
 * A list taller than its sidebar scrolls the current entry into it, that box
 * alone, while the page goes on as the reader scrolls it. Not while the reader
 * scrolls the list themselves, and not while it is not drawn: the sidebar is
 * hidden on a phone, where the sheet shows the list.
 */
function keepActiveInSight(behavior: ScrollBehavior) {
  const link = nav.value?.querySelector<HTMLElement>('[aria-current]');
  if (!scroller || !link?.getClientRects().length) return;
  if (performance.now() - readerScrolledAt < READER_SCROLL_PAUSE) return;
  const box = scroller.getBoundingClientRect();
  const rect = link.getBoundingClientRect();
  const room = Math.min(KEEP_IN_SIGHT, (box.height - rect.height) / 2);
  let by = 0;
  if (rect.top < box.top + room) by = rect.top - box.top - room;
  else if (rect.bottom > box.bottom - room)
    by = rect.bottom - box.bottom + room;
  if (Math.abs(by) < 1) return;
  scroller.scrollTo({
    top: scroller.scrollTop + by,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : behavior,
  });
}

const readerEvents = ['wheel', 'touchmove', 'pointerdown'] as const;

onMounted(() => {
  if (!nav.value) return;
  scroller = findScroller(nav.value);
  for (const name of readerEvents)
    scroller?.addEventListener(name, markReaderScroll, { passive: true });
  // The sheet opens with the current entry in sight already.
  keepActiveInSight('instant');
});
onBeforeUnmount(() => {
  for (const name of readerEvents)
    scroller?.removeEventListener(name, markReaderScroll);
  scroller = undefined;
});

watch(
  () => active,
  () => keepActiveInSight('smooth'),
  { flush: 'post' },
);
</script>

<template>
  <nav
    ref="nav"
    class="flex min-w-0 flex-col gap-xs"
    :aria-label="phrase.public_details_contents"
  >
    <div
      v-for="group in groups"
      :key="group.key"
      class="flex min-w-0 flex-col gap-xs"
      :class="
        group.sub && [
          'border-l pl-sm transition-colors',
          group.items.some((item) => item.id === active)
            ? 'border-accent/40'
            : 'border-border-2/50',
        ]
      "
    >
      <a
        v-for="item in group.items"
        :key="item.path"
        :href="item.href"
        class="flex min-w-0 items-start gap-2 leading-snug break-words
          transition focus-visible:rounded-sm focus-visible:ring-2
          focus-visible:ring-accent focus-visible:outline-none hocus:underline"
        :class="[
          group.sub ? 'text-xs' : 'text-sm',
          item.id === active ? 'text-accent' : 'text-text-1',
        ]"
        :aria-current="item.id === active ? 'location' : undefined"
      >
        <span v-if="item.icon" class="flex h-lh shrink-0 items-center">
          <Icon
            :name="item.icon"
            :class="item.id === active ? 'text-current' : 'text-text-3'"
            aria-hidden="true"
          />
        </span>
        <span class="min-w-0">{{ publicText(item.title) }}</span>
      </a>
    </div>
  </nav>
</template>
