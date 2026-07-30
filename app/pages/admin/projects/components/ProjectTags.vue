<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import type { TagEditItem, TagItem } from '#layers/thei/shared/tag';
import { projectDataInjectionKey, currentProjectUuidKey } from '../composables';

const projectData = inject(projectDataInjectionKey)!;
const currentProjectUuid = inject(currentProjectUuidKey)!;
const recommendations = ref<TagItem[]>([]);
const recommendationsFailed = ref(false);
let recommendationVersion = 0;
const selectedTags = computed<TagEditItem[]>({
  get: () => projectData.value.tags ?? [],
  set: (tags) => {
    projectData.value.tags = tags;
  },
});

const recommendationText = computed(() =>
  [
    projectData.value.title,
    projectData.value.summary,
    contentText(projectData.value.descriptionContent?.data),
    ...(projectData.value.contentSections ?? []).flatMap((section) => [
      section.title,
      section.summary,
      contentText(section.content?.data),
    ]),
  ].join(' '),
);

async function fetchRecommendations() {
  const version = ++recommendationVersion;
  recommendationsFailed.value = false;
  try {
    const result = await useRequestFetch()<TagItem[]>(
      '/api/admin/tags/recommendations',
      {
        method: 'POST',
        body: {
          text: recommendationText.value,
          projectUuid: currentProjectUuid.value,
          selectedTagUuids: selectedTags.value.flatMap((tag) =>
            tag.tagUuid ? [tag.tagUuid] : [],
          ),
        },
      },
    );
    if (version !== recommendationVersion) return;
    recommendations.value = result;
    recommendationsFailed.value = false;
  } catch {
    if (version !== recommendationVersion) return;
    recommendations.value = [];
    recommendationsFailed.value = true;
  }
}

const loadRecommendations = debounce(fetchRecommendations, 250);
await fetchRecommendations();

watch(
  [recommendationText, selectedTags],
  () => void loadRecommendations(),
  { deep: true },
);

function contentText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const blocks = (data as { blocks?: unknown[] }).blocks;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .flatMap((block) => collectStrings(block))
    .join(' ')
    .replace(/<[^>]*>/g, ' ');
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['assetUuid', 'src', 'previewSrc'].includes(key))
    .flatMap(([, item]) => collectStrings(item));
}
</script>

<template>
  <div>
    <SectionHeader
      icon="tag"
      :title="phrase.project_tags"
      :description="phrase.project_tags_hint"
      class="mb-md"
    />
    <Box>
      <div class="p-sm sm:p-md">
        <TagAdder
          v-model="selectedTags"
          :recommendations="recommendations"
        />
        <p
          v-if="recommendationsFailed"
          role="status"
          class="mt-sm text-sm text-text-error"
        >
          {{ phrase.tag_recommendations_error }}
        </p>
      </div>
    </Box>
  </div>
</template>
