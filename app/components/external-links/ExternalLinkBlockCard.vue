<script lang="ts" setup>
import { useExternalLinks } from '#layers/thei/app/composables/external-links';
import ExternalLinkPreviewCard from './ExternalLinkPreviewCard.vue';

/**
 * The card of an `externalLink` block in the editor. It reads the record
 * from the page's store, so a refresh made anywhere on the page shows here.
 */
const props = defineProps<{
  url: string;
  loading?: boolean;
  errorText?: string;
}>();

const links = useExternalLinks();
const link = computed(() => links.get(props.url));
</script>

<template>
  <ExternalLinkPreviewCard
    :link="link"
    :url="url"
    :interactive="true"
    playback="interaction"
    :loading="loading"
    :error-text="errorText"
    :loading-text="phrase.external_link_loading"
  />
</template>
