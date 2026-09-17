<script lang="ts" setup>
import type { YouTubeIntegrationData } from '#layers/thei/shared/content-integrations';

const props = defineProps<{ data: YouTubeIntegrationData }>();
const allow =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

// The privacy-enhanced host sets no tracking cookies until playback starts.
const src = computed(() => {
  const url = new URL(
    `https://www.youtube-nocookie.com/embed/${props.data.videoId}`,
  );
  if (props.data.start) url.searchParams.set('start', String(props.data.start));
  url.searchParams.set('rel', '0');
  return url.href;
});
</script>

<template>
  <div
    class="aspect-video w-full overflow-hidden rounded-normal border
      border-border-1 bg-black shadow-md shadow-shadow-1"
  >
    <iframe
      :src
      :title="phrase.content_integration_youtube"
      class="size-full"
      loading="lazy"
      :allow
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    />
  </div>
</template>
