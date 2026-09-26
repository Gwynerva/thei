<script lang="ts" setup>
import type { TagEditItem } from '#layers/thei/shared/tag';
import type { TagRecommendation } from '#layers/thei/shared/tag-recommendation';
import TagAdder from '#layers/thei/app/components/TagAdder.vue';

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
  recommendations?: TagRecommendation[];
  recommendationsFailed?: boolean;
}>();

const tags = defineModel<TagEditItem[]>({ required: true });
const root = useTemplateRef<HTMLElement>('root');
const adder = useTemplateRef<InstanceType<typeof TagAdder>>('adder');

/** Brings the block into view and puts the cursor in its field. */
function reveal() {
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  root.value?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'center',
  });
  adder.value?.focus({ preventScroll: true });
}
defineExpose({ reveal });
</script>

<template>
  <div ref="root">
    <SectionHeader
      icon="tag"
      :title="title"
      :description="description"
      class="mb-md"
    />
    <Box>
      <div class="p-sm sm:p-md">
        <TagAdder
          ref="adder"
          v-model="tags"
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
