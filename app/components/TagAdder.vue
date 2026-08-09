<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { TagEditItem, TagItem } from '#layers/thei/shared/tag';
import { normalizeTagTitle } from '#layers/thei/shared/tag';
import { moveItemById } from '#layers/thei/app/composables/drag-sort';

const props = withDefaults(
  defineProps<{
    recommendations?: TagItem[];
    searchEndpoint?: string;
  }>(),
  {
    recommendations: () => [],
    searchEndpoint: '/api/admin/tags',
  },
);

const tags = defineModel<TagEditItem[]>({ required: true });
const query = ref('');
const inputElement = ref<HTMLInputElement | null>(null);
const tagContainer = ref<HTMLElement | null>(null);
const popupOpen = ref(false);
const searching = ref(false);
const searchFailed = ref(false);
const suggestions = ref<TagItem[]>([]);
const activeIndex = ref(-1);
let searchVersion = 0;
const listboxId = useId();
const visibleSuggestions = computed(() => suggestions.value.slice(0, 5));

const visibleRecommendations = computed(() => {
  const selected = new Set(
    tags.value.map((tag) => normalizeTagTitle(tag.title)),
  );
  return props.recommendations.filter(
    (tag) => !selected.has(normalizeTagTitle(tag.title)),
  );
});

const createOptionVisible = computed(() => {
  const normalized = normalizeTagTitle(query.value);
  return (
    Boolean(normalized) &&
    !tags.value.some((tag) => normalizeTagTitle(tag.title) === normalized) &&
    !suggestions.value.some(
      (tag) => normalizeTagTitle(tag.title) === normalized,
    )
  );
});
const optionCount = computed(
  () => visibleSuggestions.value.length + (createOptionVisible.value ? 1 : 0),
);
const activeOptionId = computed(() =>
  activeIndex.value >= 0
    ? `${listboxId}-option-${activeIndex.value}`
    : undefined,
);

const search = debounce(async (version: number) => {
  const trimmed = query.value.trim();
  if (!trimmed) {
    suggestions.value = [];
    searching.value = false;
    searchFailed.value = false;
    return;
  }
  try {
    const result = await $fetch<TagItem[]>(props.searchEndpoint, {
      query: {
        query: trimmed,
        exclude: tags.value
          .flatMap((tag) => (tag.tagUuid ? [tag.tagUuid] : []))
          .join(','),
      },
    });
    if (version === searchVersion) {
      suggestions.value = result;
      searchFailed.value = false;
    }
  } catch {
    if (version === searchVersion) {
      suggestions.value = [];
      searchFailed.value = true;
    }
  } finally {
    if (version === searchVersion) searching.value = false;
  }
}, 180);

watch(query, () => {
  searchVersion += 1;
  suggestions.value = [];
  searchFailed.value = false;
  popupOpen.value = Boolean(query.value.trim());
  searching.value = popupOpen.value;
  void search(searchVersion);
});

watch([popupOpen, optionCount, createOptionVisible], ([isOpen, count]) => {
  activeIndex.value = isOpen && count ? 0 : -1;
});

function addTag(tag: TagEditItem) {
  const normalized = normalizeTagTitle(tag.title);
  if (tags.value.some((item) => normalizeTagTitle(item.title) === normalized))
    return;
  tags.value = [...tags.value, tag];
  query.value = '';
  popupOpen.value = false;
  void nextTick(() => inputElement.value?.focus());
}

function chooseActive() {
  if (!optionCount.value || activeIndex.value < 0) return;
  if (createOptionVisible.value && activeIndex.value === 0) {
    addTag({ title: query.value.trim() });
    return;
  }
  const offset = createOptionVisible.value ? 1 : 0;
  const tag = visibleSuggestions.value[activeIndex.value - offset];
  if (tag) addTag(tag);
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    popupOpen.value = true;
    if (optionCount.value) {
      activeIndex.value =
        activeIndex.value >= optionCount.value - 1 ? 0 : activeIndex.value + 1;
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (optionCount.value)
      activeIndex.value =
        activeIndex.value <= 0 ? optionCount.value - 1 : activeIndex.value - 1;
  } else if (event.key === 'Enter' && popupOpen.value) {
    event.preventDefault();
    chooseActive();
  } else if (event.key === 'Escape') {
    popupOpen.value = false;
  }
}

function focusInput() {
  inputElement.value?.focus();
}

function removeTag(index: number) {
  tags.value = tags.value.filter((_, itemIndex) => itemIndex !== index);
}

function tagDragId(tag: TagEditItem) {
  return tag.tagUuid ?? normalizeTagTitle(tag.title);
}

useDragSort(tagContainer, {
  onDrop: ({ id, newIndex }) => {
    tags.value = moveItemById(tags.value, id, newIndex, tagDragId);
  },
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      ref="tagContainer"
      class="flex min-h-12 cursor-text flex-wrap items-center gap-2
        rounded-normal border-2 border-dashed border-border-2 bg-bg-1/50 p-sm
        transition focus-within:border-accent hover:border-border-3
        focus-within:hover:border-accent"
      @click.self="focusInput"
    >
      <div
        v-for="(tag, index) in tags"
        :key="tagDragId(tag)"
        :data-drag-id="tagDragId(tag)"
        class="transition-colors"
      >
        <TagChip :tag="tag" class="cursor-auto">
          <button
            type="button"
            class="-ml-1 shrink-0 cursor-pointer leading-none transition
              hocus:text-text-error"
            :aria-label="`${phrase.delete}: ${tag.title}`"
            data-drag-ignore
            @click.stop="removeTag(index)"
          >
            <Icon name="close" />
          </button>
        </TagChip>
      </div>

      <input
        ref="inputElement"
        v-model="query"
        type="text"
        autocomplete="off"
        :aria-label="phrase.tag_search_placeholder"
        :placeholder="phrase.tag_search_placeholder"
        class="field-sizing-content max-w-full min-w-28 self-stretch
          bg-transparent text-sm outline-none sm:min-w-0"
        role="combobox"
        :aria-expanded="popupOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId"
        aria-autocomplete="list"
        @focus="popupOpen = Boolean(query.trim())"
        @keydown="onInputKeydown"
      />
    </div>

    <FloatingPopup
      v-model:open="popupOpen"
      :anchor="inputElement"
      placement="right"
      :fallback-placements="['top-start', 'bottom-start']"
      max-width="14rem"
    >
      <div
        :id="listboxId"
        role="listbox"
        :aria-label="phrase.tag_search_results"
        class="flex max-h-72 flex-col gap-1.5 overflow-auto rounded-normal
          border border-border-1 bg-bg-2 p-1.5"
      >
        <div
          v-if="createOptionVisible || visibleSuggestions.length"
          class="flex flex-col gap-1.5"
        >
          <button
            v-if="createOptionVisible"
            :id="`${listboxId}-option-0`"
            type="button"
            role="option"
            :aria-selected="activeIndex === 0"
            :aria-label="phrase.create_tag_named(query.trim())"
            class="inline-flex h-8 w-full cursor-pointer items-center gap-1
              rounded-sm border-2 border-dashed border-accent/45 bg-accent/10
              p-1 text-left text-xs leading-none font-semibold text-accent
              transition hocus:border-accent/70 hocus:bg-accent/18"
            :class="{
              'ring-2 ring-accent ring-offset-2 ring-offset-bg-2':
                activeIndex === 0,
            }"
            @pointerdown.prevent
            @click="addTag({ title: query.trim() })"
          >
            <Icon name="plus-circle" class="shrink-0" />
            <span class="truncate">{{ query.trim() }}</span>
          </button>
          <TagChip
            v-for="(tag, index) in visibleSuggestions"
            :key="tag.tagUuid"
            :id="`${listboxId}-option-${index + (createOptionVisible ? 1 : 0)}`"
            :tag="tag"
            interactive
            class="w-full"
            role="option"
            :aria-selected="
              activeIndex === index + (createOptionVisible ? 1 : 0)
            "
            :active="activeIndex === index + (createOptionVisible ? 1 : 0)"
            @pointerdown.prevent
            @click="addTag(tag)"
          />
        </div>
        <div v-if="searching" class="flex justify-center p-sm text-text-3">
          <Icon name="loading" />
          <span class="sr-only">{{ phrase.tag_search_loading }}</span>
        </div>
        <p
          v-else-if="searchFailed"
          role="status"
          class="p-sm text-center text-sm text-text-error"
        >
          {{ phrase.tag_search_error }}
        </p>
        <p
          v-else-if="query.trim() && !optionCount"
          role="status"
          class="p-sm text-center text-sm text-text-3"
        >
          {{ phrase.tag_search_no_results }}
        </p>
      </div>
    </FloatingPopup>

    <div v-if="visibleRecommendations.length">
      <p class="mb-xs text-sm font-semibold text-text-3">
        {{ phrase.recommended_tags }}
      </p>
      <div class="flex flex-wrap gap-2">
        <TagChip
          v-for="tag in visibleRecommendations"
          :key="tag.tagUuid"
          :tag="tag"
          interactive
          class="opacity-45 transition-opacity hocus:opacity-100"
          @click="addTag(tag)"
        />
      </div>
    </div>
  </div>
</template>
