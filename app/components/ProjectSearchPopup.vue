<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { ProjectSearchItem } from '#layers/thei/shared/api/project';

const props = defineProps<{
  excludeProjectUuids: string[];
}>();
const emit = defineEmits<{
  select: [project: ProjectSearchItem];
}>();

const query = ref('');
const results = ref<ProjectSearchItem[]>([]);
const loading = ref(false);
const error = ref<string>();
const inputElement = ref<HTMLInputElement>();
let requestVersion = 0;

const search = debounce(async (version: number) => {
  try {
    const response = await $fetch<ProjectSearchItem[]>('/api/admin/projects', {
      query: {
        query: query.value.trim(),
        excludeProjectUuids: props.excludeProjectUuids.join(','),
      },
    });
    if (version === requestVersion) results.value = response;
  } catch {
    if (version === requestVersion) {
      results.value = [];
      error.value = phrase.value.search_project_error;
    }
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}, 180);

function queueSearch() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = undefined;
  void search(version);
}

watch(query, queueSearch);
onMounted(queueSearch);
onUnmounted(() => {
  requestVersion++;
});

function focus() {
  inputElement.value?.focus({ preventScroll: true });
}

defineExpose({ focus });
</script>

<template>
  <section
    class="flex max-h-(--floating-popup-available-height) flex-col
      overflow-hidden rounded-normal border border-border-1 bg-bg-2 text-text-1"
    role="dialog"
    :aria-label="phrase.search_project"
  >
    <div
      class="relative shrink-0 border-b border-border-1 ring-1 ring-transparent
        transition-shadow ring-inset focus-within:ring-border-3"
    >
      <input
        ref="inputElement"
        v-model="query"
        type="search"
        autocomplete="off"
        spellcheck="false"
        :placeholder="phrase.search_project_placeholder"
        class="w-full min-w-0 appearance-none bg-bg-2 px-sm py-xs text-sm
          text-text-1 outline-none placeholder:text-text-3
          [&::-webkit-search-cancel-button]:hidden"
      />
    </div>

    <div
      v-if="loading"
      class="flex min-h-12 shrink-0 items-center justify-center text-text-3"
      role="status"
      :aria-label="phrase.search_project_loading"
    >
      <Icon name="loading" class="size-5 animate-pulse" />
    </div>
    <div
      v-else-if="results.length && !error"
      class="flex scrollbar-mini min-h-0 flex-col overflow-y-auto"
    >
      <button
        v-for="project in results"
        :key="project.projectUuid"
        type="button"
        class="group relative min-h-12 shrink-0 cursor-pointer overflow-hidden
          border-b border-border-1 bg-bg-1 text-left transition last:border-b-0
          hocus:bg-bg-3"
        @click="emit('select', project)"
      >
        <div
          class="project-search-icon absolute inset-y-0 left-0 w-12
            bg-bg-accent"
        >
          <Media
            v-bind="project.iconMedia"
            class="size-full opacity-75 transition group-hocus:opacity-100"
          />
        </div>

        <div class="relative ml-8 min-w-0 px-xs py-1">
          <div class="truncate text-sm font-semibold">
            {{ project.title }}
          </div>

          <div class="truncate text-xs text-text-3">
            {{ project.summary }}
          </div>
        </div>
      </button>
    </div>
    <div v-else-if="!error" class="p-sm text-center text-xs text-text-3">
      {{ phrase.search_project_no_results }}
    </div>
    <div
      v-else-if="error"
      class="bg-bg-error p-sm text-center text-xs text-text-error"
    >
      <Icon name="warning" class="mr-xs" />
      {{ error }}
    </div>
  </section>
</template>

<style scoped>
.project-search-icon {
  /* A directional reveal mask cannot be represented by a semantic utility. */
  mask-image: linear-gradient(
    to right,
    #000 0%,
    rgb(0 0 0 / 70%) 15%,
    rgb(0 0 0 / 10%) 80%,
    transparent 100%
  );
}
</style>
