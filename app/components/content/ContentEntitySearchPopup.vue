<script lang="ts" setup>
import {
  CONTENT_ENTITY_TYPES,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  CONTENT_ENTITY_SEARCH_LIMIT,
  type ContentEntityChoice,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import {
  contentEntityKey,
  useActiveRow,
  useContentEntitySearch,
} from '#layers/thei/app/composables/content-entity-search';

/**
 * The picker for anything content can relate with: a search field and a
 * short list of matches, each with its picture along the right edge, its
 * kind's glyph, its title and what it belongs to. A link is made with the
 * link picker instead (`link-picker/`), which goes on into the entity.
 *
 * A picker that applies its choice at once just listens to `select`. One that
 * waits for a confirmation passes the current choice as `chosen`: it stays
 * pinned at the top of the list, marked, whatever the query, and picking it
 * again says the choice is made (`confirm`).
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
const { query, results, loading, error, refresh } = useContentEntitySearch({
  entityTypes: () => props.entityTypes,
  exclude: () => props.exclude,
  publicOnly: () => props.publicOnly,
  limit: () => props.limit,
});
const input = ref<HTMLInputElement>();

type Row = { item: ContentEntityChoice; result?: ContentEntitySearchItem };

const rows = computed<Row[]>(() => {
  const chosen = props.chosen;
  const found = results.value
    .filter(
      (item) => !chosen || contentEntityKey(item) !== contentEntityKey(chosen),
    )
    .map((result) => ({ item: result, result }));
  return chosen ? [{ item: chosen }, ...found] : found;
});
const { listId, activeIndex, optionId, move, pointAt, current } = useActiveRow(
  () => rows.value.length,
  results,
);

function isChosen(item: ContentEntityChoice) {
  return Boolean(
    props.chosen && contentEntityKey(props.chosen) === contentEntityKey(item),
  );
}

function pick(row: Row) {
  if (row.result) emit('select', row.result);
  else emit('confirm');
}

function choose() {
  const row = rows.value[current()];
  if (row) pick(row);
}

onMounted(refresh);
defineExpose({ focus: () => input.value?.focus({ preventScroll: true }) });
</script>

<template>
  <section
    class="flex max-h-(--floating-popup-available-height) min-h-0 flex-col
      gap-xs overflow-hidden p-xs text-text-1"
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
      <ContentEntityRow
        v-for="(row, index) in rows"
        :id="optionId(index)"
        :key="contentEntityKey(row.item)"
        :item="row.item"
        :active="index === activeIndex"
        :chosen="isChosen(row.item)"
        secondary
        @point="pointAt($event, index)"
        @pick="pick(row)"
      />
    </div>
    <p v-else-if="!loading" class="py-1 text-center text-xs text-text-3">
      {{ error ? phrase.search_entity_error : phrase.search_entity_no_results }}
    </p>
  </section>
</template>
