<script lang="ts" setup>
import { debounce } from 'perfect-debounce';
import { projectTagRecommendationText } from '#layers/thei/shared/admin/project';
import type { TagEditItem, TagItem } from '#layers/thei/shared/tag';
import { projectDataInjectionKey, currentProjectUuidKey } from '../composables';

const projectData = inject(projectDataInjectionKey)!;
const props = defineProps<{ title?: string; description?: string }>();
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
  projectTagRecommendationText(projectData.value),
);

async function fetchRecommendations() {
  const version = ++recommendationVersion;
  recommendationsFailed.value = false;
  try {
    const result = await useRequestFetch()<TagItem[]>(
      '/api/admin/tag-recommendations',
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

watch([recommendationText, selectedTags], () => void loadRecommendations(), {
  deep: true,
});
</script>

<template>
  <div>
    <SectionHeader
      icon="tag"
      :title="props.title ?? phrase.project_tags"
      :description="props.description ?? phrase.project_tags_hint"
      class="mb-md"
    />
    <Box>
      <div class="p-sm sm:p-md">
        <TagAdder v-model="selectedTags" :recommendations="recommendations" />
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
