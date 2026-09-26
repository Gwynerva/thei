<script lang="ts" setup>
import type { TagEditItem, TagItem } from '#layers/thei/shared/tag';

/**
 * The tags block of a project or an event: the tags themselves and the ones
 * recommended for it. The form owns the recommendations, since it also knows
 * everything they are drawn from.
 */
const {
  title,
  description,
  recommendations = [],
  recommendationsFailed = false,
} = defineProps<{
  title: string;
  description: string;
  recommendations?: TagItem[];
  recommendationsFailed?: boolean;
}>();

const tags = defineModel<TagEditItem[]>({ required: true });
</script>

<template>
  <div>
    <SectionHeader
      icon="tag"
      :title="title"
      :description="description"
      class="mb-md"
    />
    <Box>
      <div class="p-sm sm:p-md">
        <TagAdder v-model="tags" :recommendations="recommendations" />
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
