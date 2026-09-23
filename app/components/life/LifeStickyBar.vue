<script lang="ts" setup>
import type { LifeFilter, LifeScopeRef } from '#layers/thei/shared/life';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';

/**
 * The second sticky bar: which day the reader is on, and what the feed shows.
 *
 * It only appears once it is actually stuck, and takes no room before then:
 * above the feed the page already says all of it — the first day's header
 * gives the date, and the page carries its own filter — so an unstuck bar
 * would only hang between the two.
 */
const { day, scope, scopeIcon } = defineProps<{
  day: string;
  scope: LifeScopeRef;
  /** Heart for a life, the project's own icon for a project. */
  scopeIcon: IconName;
  /** A project's own icon; the glyph stands in only where there is none. */
  scopeMedia?: MediaDescriptor;
  scopeLabel: string;
  href: string;
}>();

const emit = defineEmits<{ pick: []; stuck: [boolean] }>();
const filter = defineModel<LifeFilter>('filter');

const isAdmin = useIsAdmin();
const publicHeader = useStickyHeaderContext();
const top = computed(
  () =>
    `calc(${isAdmin.value ? 'var(--height-admin-bar) + ' : ''}${publicHeader?.height.value ?? 0}px)`,
);

// Day, month, year — the order the date is spoken in, not the order it is
// stored in. The month is formatted together with the day so languages that
// inflect it get the form a date uses ("сентября", not "сентябрь").
const formatter = computed(
  () =>
    new Intl.DateTimeFormat(language.value.code, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
);

function partOf(date: string, type: Intl.DateTimeFormatPartTypes) {
  return (
    formatter.value
      .formatToParts(new Date(`${date}T00:00:00Z`))
      .find((item) => item.type === type)?.value ?? ''
  );
}

/**
 * The widest values a cell can hold, laid invisibly under the current one:
 * the cell then always takes their width, so the bar does not shift sideways
 * when the reader scrolls into another day or month. Months are formatted
 * with a day so languages that inflect them measure the form a date uses.
 */
const spacers = computed<Record<string, string[]>>(() => ({
  day: [partOf('2000-01-28', 'day')],
  month: Array.from({ length: 12 }, (_, index) =>
    partOf(`2000-${String(index + 1).padStart(2, '0')}-15`, 'month'),
  ),
}));

const parts = computed(() => {
  const formatted = formatter.value.formatToParts(new Date(`${day}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    formatted.find((item) => item.type === type)?.value ?? '';
  return [
    { key: 'day', value: part('day') },
    { key: 'month', value: part('month') },
    { key: 'year', value: part('year') },
  ];
});

/**
 * The bar reports its own stuck state so the site header can drop its shadow:
 * two stacked shadows read as a seam, and only the lower bar should cast one.
 */
const barRoot = useTemplateRef<HTMLElement>('barRoot');
const stuck = ref(false);
let stuckObserver: MutationObserver | undefined;

function readStuck() {
  const element = barRoot.value?.querySelector('[data-sticky-stuck]');
  stuck.value = Boolean(element);
}

onMounted(() => {
  readStuck();
  if (!barRoot.value || typeof MutationObserver === 'undefined') return;
  stuckObserver = new MutationObserver(readStuck);
  stuckObserver.observe(barRoot.value, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-sticky-stuck'],
  });
});
onBeforeUnmount(() => stuckObserver?.disconnect());
const filterOpen = ref(false);
watch(stuck, (value) => {
  emit('stuck', value);
  publicHeader?.setSecondaryStuck(value);
  // Its popup would be left pointing at a bar that is no longer there.
  if (!value) filterOpen.value = false;
});
onBeforeUnmount(() => publicHeader?.setSecondaryStuck(false));
</script>

<template>
  <!--
    `contents` so this wrapper never becomes the sticky bar's containing
    block: a box of its own height would let the bar scroll straight out of it.
    It exists only to give the stuck-state observer something to watch.
  -->
  <div ref="barRoot" class="contents">
    <!--
      The sticky box is zero-high, so the bar overlays the feed instead of
      pushing it down, and is only shown once stuck.
    -->
    <Sticky :top="top" class="z-10 h-0">
      <div
        data-life-sticky-bar
        class="border-b border-border-1 bg-bg-1/70 shadow-lg shadow-shadow-1
          backdrop-blur-md transition-[opacity,translate,visibility]
          duration-200 motion-reduce:duration-0"
        :class="
          stuck
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-1 opacity-0'
        "
      >
        <!--
          The side padding matches the feed's, and the icon sits in a slot as
          wide as the rail column, so its centre lands on the rail on both
          layouts.
        -->
        <nav
          class="m-auto grid w-(--width-wide) max-w-full
            grid-cols-[1fr_auto_1fr] items-center gap-sm py-xs pr-window pl-xs
            sm:px-window"
          :aria-label="scopeLabel"
        >
          <span class="flex w-8 justify-center justify-self-start sm:w-16">
            <Media
              v-if="scopeMedia"
              v-bind="scopeMedia"
              fit="contain"
              playback="autoplay"
              autoplay-reduced-motion
              loop
              muted
              class="size-8 shrink-0 rounded-sm"
              :data-title-popup="scopeLabel"
            />
            <span
              v-else
              class="flex size-8 shrink-0 items-center justify-center rounded-sm
                bg-accent/10 text-accent"
              :data-title-popup="scopeLabel"
            >
              <Icon :name="scopeIcon" />
            </span>
          </span>

          <TheiLink
            :to="href"
            class="group flex min-w-0 items-center gap-px font-semibold
              text-text-2"
            @click="emit('pick')"
          >
            <span
              v-for="part in parts"
              :key="part.key"
              class="grid bg-bg-3 px-xs py-1 text-center tabular-nums transition
                group-hocus:bg-accent/15 group-hocus:text-accent
                first:rounded-l-sm last:rounded-r-sm"
            >
              <span
                v-for="spacer in spacers[part.key]"
                :key="`spacer-${spacer}`"
                class="invisible col-start-1 row-start-1 block"
                aria-hidden="true"
                >{{ spacer }}</span
              >
              <Transition
                enter-from-class="translate-y-1 opacity-0"
                enter-active-class="transition duration-200
                  motion-reduce:duration-0"
                leave-to-class="-translate-y-1 opacity-0"
                leave-active-class="transition duration-150
                  motion-reduce:duration-0"
              >
                <span :key="part.value" class="col-start-1 row-start-1 block">{{
                  part.value
                }}</span>
              </Transition>
            </span>
          </TheiLink>

          <LifeFilterButton
            v-model:filter="filter"
            v-model:open="filterOpen"
            :scope="scope"
            variant="bar"
            class="justify-self-end"
          />
        </nav>
      </div>
    </Sticky>
  </div>
</template>
