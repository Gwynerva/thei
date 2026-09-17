<script lang="ts" setup>
import {
  contentIntegrationUrl,
  normalizeContentIntegration,
  type ContentIntegrationData,
} from '#layers/thei/shared/content-integrations';
import ContentYouTubePlayer from './ContentYouTubePlayer.vue';

const props = defineProps<{
  data: unknown;
  /** Shows the source address under the player, for the editor. */
  showSource?: boolean;
}>();

const integration = computed((): ContentIntegrationData | undefined => {
  try {
    return normalizeContentIntegration(props.data);
  } catch {
    return undefined;
  }
});
const url = computed(() => contentIntegrationUrl(props.data));
</script>

<template>
  <div v-if="integration" class="flex w-full min-w-0 flex-col gap-xs">
    <ContentYouTubePlayer
      v-if="integration.provider === 'youtube'"
      :data="integration"
    />
    <a
      v-if="showSource && url"
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex min-w-0 items-center gap-1 self-start text-xs
        text-text-3 transition hocus:text-accent"
    >
      <Icon name="external-link" class="shrink-0" />
      <span class="truncate">{{ url }}</span>
    </a>
  </div>
</template>
