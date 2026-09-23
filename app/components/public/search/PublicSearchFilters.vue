<script lang="ts" setup>
import type { PublicSearchTagFacet } from '#layers/thei/shared/api/public';
import type { IconName } from '#thei/icons';
import {
  countPublicSearchFilters,
  normalizePublicSearchText,
  type PublicSearchFilters,
  type PublicSearchType,
} from '#layers/thei/shared/public-search';
import { tagAccentCssColor } from '#layers/thei/shared/tag';

const props = defineProps<{
  filters: PublicSearchFilters;
  tags: PublicSearchTagFacet[];
}>();
const emit = defineEmits<{
  change: [patch: Partial<PublicSearchFilters>];
}>();

const tagQuery = ref('');
const types = computed<
  { value?: PublicSearchType; label: string; icon: IconName }[]
>(() => [
  { label: phrase.value.search_type_all, icon: 'blocks' },
  { value: 'project', label: phrase.value.projects, icon: 'project' },
  { value: 'event', label: phrase.value.events, icon: 'event' },
]);
const activeTags = computed(() => props.tags.filter((facet) => facet.state));
const availableTags = computed(() => {
  const query = normalizePublicSearchText(tagQuery.value.trim());
  return props.tags.filter(
    (facet) =>
      !facet.state &&
      (!query || normalizePublicSearchText(facet.tag.title).includes(query)),
  );
});
const activeCount = computed(() => countPublicSearchFilters(props.filters));

function without(slugs: string[], slug: string) {
  return slugs.filter((item) => item !== slug);
}

function includeTag(slug: string) {
  emit('change', {
    tags: [...props.filters.tags, slug],
    exclude: without(props.filters.exclude, slug),
  });
}

function excludeTag(slug: string) {
  emit('change', {
    tags: without(props.filters.tags, slug),
    exclude: [...props.filters.exclude, slug],
  });
}

function removeTag(slug: string) {
  emit('change', {
    tags: without(props.filters.tags, slug),
    exclude: without(props.filters.exclude, slug),
  });
}

function reset() {
  tagQuery.value = '';
  emit('change', {
    type: undefined,
    showcase: false,
    cv: false,
    tags: [],
    exclude: [],
  });
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-md">
    <PublicCollapsibleSection :title="phrase.search_filter_type">
      <div
        class="grid grid-cols-3 gap-1 rounded-normal bg-bg-3/60 p-1"
        role="radiogroup"
        :aria-label="phrase.search_filter_type"
      >
        <button
          v-for="option in types"
          :key="option.value ?? 'all'"
          type="button"
          role="radio"
          :aria-checked="filters.type === option.value"
          class="flex min-w-0 cursor-pointer flex-col items-center gap-0.5
            rounded-sm px-1 py-1.5 text-xs font-semibold transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none"
          :class="
            filters.type === option.value
              ? 'bg-bg-1 text-text-1 shadow-sm shadow-shadow-2'
              : 'text-text-2 hocus:bg-bg-1/50 hocus:text-text-1'
          "
          @click="emit('change', { type: option.value })"
        >
          <Icon
            :name="option.icon"
            class="text-lg"
            :class="{ 'text-accent': filters.type === option.value }"
          />
          <span class="max-w-full truncate">{{ option.label }}</span>
        </button>
      </div>
    </PublicCollapsibleSection>

    <PublicCollapsibleSection
      v-if="filters.type !== 'event'"
      :title="phrase.search_filter_projects"
    >
      <div class="flex flex-wrap gap-xs">
        <button
          v-for="flag in [
            {
              key: 'showcase' as const,
              icon: 'star' as const,
              label: phrase.showcase,
            },
            {
              key: 'cv' as const,
              icon: 'case-important' as const,
              label: phrase.cv_project_label,
            },
          ]"
          :key="flag.key"
          type="button"
          :aria-pressed="filters[flag.key]"
          class="inline-flex cursor-pointer items-center gap-2 rounded-full
            border px-sm py-1 text-sm font-semibold transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none"
          :class="
            filters[flag.key]
              ? 'border-accent/50 bg-bg-accent text-accent'
              : `border-border-1 text-text-2 hocus:border-border-2
                hocus:text-text-1`
          "
          @click="emit('change', { [flag.key]: !filters[flag.key] })"
        >
          <Icon :name="flag.icon" class="shrink-0" />
          {{ flag.label }}
        </button>
      </div>
    </PublicCollapsibleSection>

    <PublicCollapsibleSection v-if="tags.length" :title="phrase.tags">
      <div class="flex min-w-0 flex-col gap-sm">
        <ul
          v-if="activeTags.length"
          class="flex flex-wrap gap-xs"
          :aria-label="phrase.search_tags_active"
        >
          <li v-for="facet in activeTags" :key="facet.tag.slug" class="min-w-0">
            <button
              type="button"
              class="inline-flex max-w-full cursor-pointer items-center gap-2
                rounded-sm border py-1 pr-1 pl-1.5 text-xs font-semibold
                transition focus-visible:ring-2 focus-visible:ring-accent
                focus-visible:outline-none"
              :class="
                facet.state === 'include'
                  ? `border-accent/45 bg-bg-accent text-text-1
                    hocus:border-accent`
                  : `border-border-error bg-bg-error text-text-2
                    hocus:text-text-1`
              "
              :aria-label="phrase.search_tag_remove(facet.tag.title)"
              :data-title-popup="phrase.search_tag_remove(facet.tag.title)"
              @click="removeTag(facet.tag.slug)"
            >
              <Icon
                :name="facet.state === 'include' ? 'plus' : 'minus'"
                class="shrink-0"
                :class="
                  facet.state === 'include' ? 'text-accent' : 'text-text-error'
                "
              />
              <span
                class="truncate"
                :class="{ 'line-through': facet.state === 'exclude' }"
                >{{ publicText(facet.tag.title) }}</span
              >
              <Icon name="close" class="shrink-0 text-text-3" />
            </button>
          </li>
        </ul>

        <label
          class="flex items-center gap-xs rounded-sm border border-border-1
            bg-bg-1 px-xs transition focus-within:border-border-3
            hocus:border-border-2"
        >
          <Icon name="search" class="shrink-0 text-text-3" />
          <input
            v-model="tagQuery"
            type="search"
            class="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none
              placeholder:text-text-3"
            :placeholder="phrase.search_tags_filter_placeholder"
            :aria-label="phrase.search_tags_filter_placeholder"
          />
        </label>

        <ul
          v-if="availableTags.length"
          class="-mx-1 flex scrollbar-hover max-h-72 flex-col overflow-y-auto
            px-1"
        >
          <li
            v-for="facet in availableTags"
            :key="facet.tag.slug"
            class="flex min-w-0 items-center gap-1 rounded-sm py-0.5 pl-1
              transition hover:bg-bg-3/60"
          >
            <span
              class="mr-1 flex size-5 shrink-0 items-center justify-center
                overflow-hidden rounded-xs"
              :style="{ color: tagAccentCssColor(facet.tag) }"
            >
              <Media
                v-if="facet.tag.iconMedia"
                v-bind="facet.tag.iconMedia"
                class="size-full"
              />
              <Icon v-else name="tag" />
            </span>
            <span class="min-w-0 flex-1 truncate text-xs">{{
              facet.tag.title
            }}</span>
            <span class="text-xs text-text-3 tabular-nums">{{
              facet.count
            }}</span>
            <button
              type="button"
              class="flex size-7 shrink-0 cursor-pointer items-center
                justify-center rounded-sm text-text-3 transition
                focus-visible:ring-2 focus-visible:ring-accent
                focus-visible:outline-none hocus:bg-accent/15 hocus:text-accent"
              :aria-label="phrase.search_tag_include(facet.tag.title)"
              :data-title-popup="phrase.search_tag_include(facet.tag.title)"
              @click="includeTag(facet.tag.slug)"
            >
              <Icon name="plus" />
            </button>
            <button
              type="button"
              class="flex size-7 shrink-0 cursor-pointer items-center
                justify-center rounded-sm text-text-3 transition
                focus-visible:ring-2 focus-visible:ring-accent
                focus-visible:outline-none hocus:bg-bg-error
                hocus:text-text-error"
              :aria-label="phrase.search_tag_exclude(facet.tag.title)"
              :data-title-popup="phrase.search_tag_exclude(facet.tag.title)"
              @click="excludeTag(facet.tag.slug)"
            >
              <Icon name="minus" />
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-text-3">{{ phrase.search_tags_none }}</p>
      </div>
    </PublicCollapsibleSection>

    <button
      v-if="activeCount"
      type="button"
      class="inline-flex cursor-pointer items-center justify-center gap-2
        self-start rounded-sm px-xs py-1 text-sm font-semibold text-text-2
        transition focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none hocus:bg-bg-3 hocus:text-text-1"
      @click="reset"
    >
      <Icon name="refresh" />
      {{ phrase.search_reset_filters }}
    </button>
  </div>
</template>
