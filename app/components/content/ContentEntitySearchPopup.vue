<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import {
  CONTENT_ENTITY_TYPES,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  CONTENT_ENTITY_SEARCH_LIMIT,
  type ContentEntityChoice,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * The picker for anything content can link to or relate with: a search
 * field and a short list of matches, each with its picture along the right
 * edge, its kind's glyph, its title and what it belongs to.
 *
 * A picker that applies its choice at once just listens to `select`. One that
 * waits for a confirmation passes the current choice as `chosen`: it stays
 * pinned at the top of the list, marked, whatever the query, and picking it
 * again says the choice is made (`confirm`).
 *
 * It is the surface of its popup, and the `footer` slot is for whatever the
 * popup wants below the list — a note field, say — on that same surface.
 */
const props = withDefaults(
  defineProps<{
    entityTypes?: ContentEntityType[];
    exclude?: string[];
    publicOnly?: boolean;
    limit?: number;
    chosen?: ContentEntityChoice;
  }>(),
  {
    entityTypes: () => [...CONTENT_ENTITY_TYPES],
    exclude: () => [],
    limit: CONTENT_ENTITY_SEARCH_LIMIT,
  },
);
const emit = defineEmits<{
  select: [item: ContentEntitySearchItem];
  confirm: [];
}>();
const query = ref('');
const results = ref<ContentEntitySearchItem[]>([]);
const loading = ref(false);
const error = ref(false);
/** The row the arrow keys are on; none until they are used. */
const activeIndex = ref(-1);
const input = ref<HTMLInputElement>();
const listId = useId();
let version = 0;

type Row = { item: ContentEntityChoice; result?: ContentEntitySearchItem };

const rows = computed<Row[]>(() => {
  const chosen = props.chosen;
  const found = results.value
    .filter((item) => !chosen || itemKey(item) !== itemKey(chosen))
    .map((result) => ({ item: result, result }));
  return chosen ? [{ item: chosen }, ...found] : found;
});

const search = debounce(async (current: number) => {
  if (current !== version) return;
  try {
    const response = await $fetch<ContentEntitySearchItem[]>(
      '/api/admin/content-entities',
      {
        query: {
          query: query.value.trim(),
          entityTypes: props.entityTypes.join(','),
          exclude: props.exclude.join(','),
          publicOnly: props.publicOnly ? 'true' : undefined,
          limit: props.limit,
        },
      },
    );
    if (current !== version) return;
    results.value = response;
    activeIndex.value = -1;
  } catch {
    if (current === version) {
      results.value = [];
      error.value = true;
    }
  } finally {
    if (current === version) loading.value = false;
  }
}, 180);

function queue() {
  const current = ++version;
  loading.value = true;
  error.value = false;
  void search(current);
}

function itemKey(item: Pick<ContentEntityChoice, 'entityType' | 'entityId'>) {
  return `${item.entityType}:${item.entityId}`;
}

function optionId(index: number) {
  return `${listId}-${index}`;
}

function secondary(item: ContentEntityChoice) {
  return [item.parent?.title, item.summary].filter(Boolean).join(' · ');
}

function isChosen(item: ContentEntityChoice) {
  return Boolean(props.chosen && itemKey(props.chosen) === itemKey(item));
}

function move(step: number) {
  const count = rows.value.length;
  if (!count) return;
  activeIndex.value = (activeIndex.value + step + count) % count;
  document
    .getElementById(optionId(activeIndex.value))
    ?.scrollIntoView({ block: 'nearest' });
}

function pick(row: Row) {
  if (row.result) emit('select', row.result);
  else emit('confirm');
}

/** Enter takes the row the arrows are on, or the first one. */
function choose() {
  const row = rows.value[Math.max(0, activeIndex.value)];
  if (row) pick(row);
}

watch(query, queue);
onMounted(queue);
onUnmounted(() => {
  version++;
});
defineExpose({ focus: () => input.value?.focus({ preventScroll: true }) });
</script>

<template>
  <section
    class="flex max-h-(--floating-popup-available-height) min-h-0 flex-col
      gap-xs overflow-hidden rounded-normal border border-border-1 bg-bg-2 p-xs
      text-text-1"
    role="dialog"
  >
    <div class="relative">
      <FieldInput
        v-model="query"
        type="search"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="listId"
        :aria-expanded="rows.length > 0"
        :aria-activedescendant="
          activeIndex >= 0 ? optionId(activeIndex) : undefined
        "
        class="h-9 py-1 pr-9 text-sm [&::-webkit-search-cancel-button]:hidden"
        :placeholder="phrase.search_entity_placeholder"
        @element="input = $event"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose"
      />
      <Icon
        v-if="loading"
        name="loading"
        class="pointer-events-none absolute top-1/2 right-xs -translate-y-1/2
          text-text-3"
        aria-hidden="true"
      />
    </div>
    <div
      v-if="rows.length && !error"
      :id="listId"
      role="listbox"
      class="flex scrollbar-hover min-h-0 flex-col gap-1 overflow-y-auto"
    >
      <MediaInteraction
        v-for="(row, index) in rows"
        :key="itemKey(row.item)"
        v-slot="{ engaged, events }"
      >
        <button
          v-on="events"
          :id="optionId(index)"
          type="button"
          role="option"
          :aria-selected="isChosen(row.item)"
          class="group relative flex min-h-12 w-full shrink-0 cursor-pointer
            items-center overflow-hidden rounded-sm bg-bg-1 text-left
            transition-colors hocus:bg-bg-3"
          :class="{
            'bg-bg-3': index === activeIndex,
            'entity-search-chosen': isChosen(row.item),
          }"
          @pointerenter="activeIndex = index"
          @click="pick(row)"
        >
          <MediaEdge
            :media="row.item.previewMedia"
            side="right"
            fade="preview"
            playback="interaction"
            :engaged
            class="w-24"
          />
          <span
            class="entity-search-text relative flex min-w-0 flex-1 flex-col
              gap-0.5 py-1 pr-16 pl-xs"
          >
            <span class="flex items-center gap-1 truncate text-sm font-semibold"
              ><Icon
                :name="entityTypeIcon(row.item.entityType)"
                :aria-label="entityTypeLabel(row.item.entityType)"
                role="img"
                class="shrink-0 text-xs text-text-2"
              />{{ entityDisplayTitle(row.item) }}</span
            >
            <span
              v-if="secondary(row.item)"
              class="block truncate text-xs text-text-3"
              :class="{ italic: row.item.date }"
              >{{ secondary(row.item) }}</span
            >
          </span>
        </button>
      </MediaInteraction>
    </div>
    <p v-else-if="!loading" class="py-1 text-center text-xs text-text-3">
      {{ error ? phrase.search_entity_error : phrase.search_entity_no_results }}
    </p>
    <slot name="footer"></slot>
  </section>
</template>

<style scoped>
/*
 * The choice a confirming picker holds, marked in the accent. An outline is
 * drawn over the picture along the edge, where an inset shadow would not be.
 */
.entity-search-chosen {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 12%,
    var(--color-bg-1)
  );
  outline: 1.5px solid var(--color-accent);
  outline-offset: -1.5px;
}

.entity-search-text {
  text-shadow:
    0 0 0.5em var(--color-bg-1),
    0 0 0.9em var(--color-bg-1);
}
</style>
