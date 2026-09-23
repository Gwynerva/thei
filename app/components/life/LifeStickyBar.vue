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
// stored in.
const parts = computed(() => {
  const [year = '', month = '', date = ''] = day.split('-');
  return [
    { key: 'day', value: date },
    { key: 'month', value: month },
    { key: 'year', value: year },
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
        <nav
          class="m-auto flex w-(--width-wide) max-w-full items-center gap-sm
            px-window py-xs"
          :aria-label="scopeLabel"
        >
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-sm
              bg-accent/10 text-accent"
            :data-title-popup="scopeLabel"
          >
            <Icon :name="scopeIcon" />
          </span>

          <TheiLink
            :to="href"
            class="group flex min-w-0 items-center divide-x divide-border-1
              rounded-sm bg-bg-3 font-semibold text-text-2 transition
              hocus:bg-accent/15 hocus:text-accent"
            @click="emit('pick')"
          >
            <span
              v-for="part in parts"
              :key="part.key"
              class="px-xs py-1 text-center tabular-nums"
              :class="part.key === 'year' ? 'w-14' : 'w-9'"
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

          <div class="ml-auto shrink-0">
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
