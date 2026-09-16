<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { ContentEntityType } from '#layers/thei/shared/content-link';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';

const props = withDefaults(
  defineProps<{
    entityTypes?: ContentEntityType[];
    exclude?: string[];
    publicOnly?: boolean;
  }>(),
  {
    entityTypes: () => ['project', 'event', 'page'],
    exclude: () => [],
  },
);
const emit = defineEmits<{ select: [item: ContentEntitySearchItem] }>();
const query = ref('');
const results = ref<ContentEntitySearchItem[]>([]);
const loading = ref(false);
const error = ref(false);
const input = ref<HTMLInputElement>();
let version = 0;
const search = debounce(async (current: number) => {
  try {
    const response = await $fetch<ContentEntitySearchItem[]>(
      '/api/admin/content-entities',
      {
        query: {
          query: query.value.trim(),
          entityTypes: props.entityTypes.join(','),
          exclude: props.exclude.join(','),
          publicOnly: props.publicOnly ? 'true' : undefined,
        },
      },
    );
    if (current === version) results.value = response;
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
watch(query, queue);
onMounted(queue);
onUnmounted(() => {
  version++;
});
defineExpose({ focus: () => input.value?.focus({ preventScroll: true }) });
</script>

<template>
  <section
    class="flex max-h-(--floating-popup-available-height) flex-col
      overflow-hidden rounded-normal border border-border-1 bg-bg-2 text-text-1"
    role="dialog"
  >
    <input
      ref="input"
      v-model="query"
      type="search"
      autocomplete="off"
      spellcheck="false"
      :placeholder="phrase.search_project_placeholder"
      class="w-full bg-bg-2 px-sm py-xs text-sm outline-none
        placeholder:text-text-3"
    />
    <div v-if="loading" class="flex min-h-12 items-center justify-center">
      <Icon name="loading" />
    </div>
    <div
      v-else-if="results.length && !error"
      class="flex scrollbar-mini min-h-0 flex-col overflow-y-auto"
    >
      <MediaInteraction
        v-for="item in results"
        :key="`${item.entityType}:${item.entityId}`"
        v-slot="{ engaged, events }"
      >
        <button
          v-on="events"
          type="button"
          class="group relative min-h-14 cursor-pointer overflow-hidden border-t
            border-border-1 bg-bg-1 text-left first:border-t-0 hocus:bg-bg-3"
          @click="emit('select', item)"
        >
          <MediaEdge
            :media="item.previewMedia"
            side="right"
            fade="preview"
            playback="interaction"
            :engaged
            class="w-24"
          >
            <span
              class="flex size-full items-center justify-end pr-xs text-text-3"
              ><Icon :name="item.entityType"
            /></span>
          </MediaEdge>
          <span class="relative block min-w-0 py-1 pr-16 pl-xs">
            <span class="flex items-center gap-1 truncate text-sm font-semibold"
              ><Icon
                :name="item.entityType"
                class="shrink-0 text-xs text-text-2"
              />{{ item.title }}</span
            >
            <span class="block truncate text-xs text-text-3">{{
              item.summary
            }}</span>
          </span>
        </button>
      </MediaInteraction>
    </div>
    <div v-else class="p-sm text-center text-xs text-text-3">
      {{
        error ? phrase.search_project_error : phrase.search_project_no_results
      }}
    </div>
  </section>
</template>
