<script lang="ts" setup>
import {
  lifeFilterKinds,
  type LifeEntityKind,
  type LifeFilter,
  type LifeScopeRef,
} from '#layers/thei/shared/life';
import type { IconName } from '#thei/icons';
import { lifeEntityKindIcon } from './life-entity-icon';

/**
 * The second sticky bar: which day the reader is on, and what the feed shows.
 *
 * It only paints itself once it is actually stuck. Unstuck it would sit over
 * the page's top glow with an opaque plate, which is the one thing the glow is
 * there for.
 */
const { day, scope, scopeIcon } = defineProps<{
  day: string;
  scope: LifeScopeRef;
  /** Heart for a life, the project's own icon for a project. */
  scopeIcon: IconName;
  scopeLabel: string;
  href: string;
}>();

const emit = defineEmits<{ pick: [] }>();
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

const kinds = computed(() => lifeFilterKinds(scope));
const isCustom = computed(() => Boolean(filter.value?.length));
const filterOpen = ref(false);
const filterAnchor = useTemplateRef<HTMLElement>('filterAnchor');

function isShown(kind: LifeEntityKind) {
  return !filter.value || filter.value.includes(kind);
}

function toggle(kind: LifeEntityKind) {
  const current = filter.value ?? kinds.value;
  const next = current.includes(kind)
    ? current.filter((item) => item !== kind)
    : [...current, kind];
  // Nothing selected reads as "show everything" rather than an empty feed,
  // which is the only reading that leaves a way back.
  filter.value =
    next.length === 0 || next.length === kinds.value.length
      ? undefined
      : kinds.value.filter((item) => next.includes(item));
}

function showAll() {
  filter.value = undefined;
}

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
watch(stuck, (value) => publicHeader?.setSecondaryStuck(value));
onBeforeUnmount(() => publicHeader?.setSecondaryStuck(false));
</script>

<template>
  <!--
    `contents` so this wrapper never becomes the sticky bar's containing
    block: a box of its own height would let the bar scroll straight out of it.
    It exists only to give the stuck-state observer something to watch.
  -->
  <div ref="barRoot" class="contents">
    <Sticky
      data-life-sticky-bar
      :top="top"
      class="z-10 shadow-lg shadow-transparent transition-shadow
        sticky-stuck:shadow-shadow-1"
    >
      <div
        class="border-b border-transparent transition-colors
          sticky-stuck:border-border-1 sticky-stuck:bg-bg-1/70
          sticky-stuck:backdrop-blur-md"
      >
        <!--
          The side padding matches the feed's, and the icon sits in a slot as
          wide as the rail column, so its centre lands on the rail on both
          layouts. The icon only appears once the bar is stuck: above the feed
          it would sit over the page glow without the plate that frames it.
        -->
        <nav
          class="m-auto grid w-(--width-wide) max-w-full
            grid-cols-[1fr_auto_1fr] items-center gap-sm py-xs pr-window pl-0
            sm:px-window"
          :aria-label="scopeLabel"
        >
          <span class="flex w-8 justify-center justify-self-start sm:w-16">
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-sm
                bg-accent/10 text-accent opacity-0 transition-opacity
                motion-reduce:transition-none sticky-stuck:opacity-100"
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

          <div class="shrink-0 justify-self-end">
            <button
              ref="filterAnchor"
              type="button"
              class="relative flex size-9 cursor-pointer items-center
                justify-center rounded-sm text-text-2 transition hocus:bg-bg-3
                hocus:text-text-1"
              :aria-label="phrase.life_filter"
              :aria-expanded="filterOpen"
              :data-title-popup="phrase.life_filter"
              @click="filterOpen = !filterOpen"
            >
              <Icon name="filter" />
              <span
                v-if="isCustom"
                class="absolute top-1 right-1 size-2 rounded-full bg-accent"
                aria-hidden="true"
              ></span>
            </button>
            <FloatingPopup
              v-model:open="filterOpen"
              :anchor="filterAnchor"
              placement="bottom-end"
              max-width="16rem"
            >
              <section
                class="flex flex-col gap-1 rounded-normal border border-border-1
                  bg-bg-2 p-xs text-text-1"
                role="dialog"
                :aria-label="phrase.life_filter"
              >
                <label
                  v-for="kind in kinds"
                  :key="kind"
                  class="flex cursor-pointer items-center gap-sm rounded-sm
                    px-xs py-1 text-sm transition hocus:bg-bg-3"
                >
                  <input
                    type="checkbox"
                    class="accent-accent"
                    :checked="isShown(kind)"
                    @change="toggle(kind)"
                  />
                  <Icon
                    :name="lifeEntityKindIcon(kind)"
                    class="shrink-0 text-text-3"
                  />
                  <span class="min-w-0 flex-1 truncate">{{
                    phrase.life_filter_kind(kind)
                  }}</span>
                </label>
                <button
                  v-if="isCustom"
                  type="button"
                  class="mt-1 cursor-pointer rounded-sm px-xs py-1 text-left
                    text-sm font-semibold text-accent transition hocus:bg-bg-3"
                  @click="showAll"
                >
                  {{ phrase.life_filter_all }}
                </button>
              </section>
            </FloatingPopup>
          </div>
        </nav>
      </div>
    </Sticky>
  </div>
</template>
