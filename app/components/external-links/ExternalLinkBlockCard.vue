<script lang="ts" setup>
import { useExternalLinks } from '#layers/thei/app/composables/external-links';
import ExternalLinkPreviewCard from './ExternalLinkPreviewCard.vue';
import ContentLinkNote from '../content/ContentLinkNote.vue';

/**
 * The card of an `externalLink` block in the editor. It reads the record
 * from the page's store, so a refresh made anywhere on the page shows here.
 *
 * Where the block can be edited, the card is not a link — its last line is
 * the owner's note, written in place, and a field cannot live inside a link.
 */
const props = defineProps<{
  url: string;
  note?: string;
  editable?: boolean;
  notePlaceholder?: string;
  loading?: boolean;
  errorText?: string;
}>();
const emit = defineEmits<{ 'update:note': [value: string] }>();

const links = useExternalLinks();
const link = computed(() => links.get(props.url));
</script>

<template>
  <ExternalLinkPreviewCard
    :link="link"
    :url="url"
    :interactive="!editable"
    playback="interaction"
    :loading="loading"
    :error-text="errorText"
    :loading-text="phrase.external_link_loading"
  >
    <template v-if="editable || note" #note>
      <ContentLinkNote
        :note
        :editable
        :placeholder="notePlaceholder"
        @update:note="emit('update:note', $event)"
      />
    </template>
  </ExternalLinkPreviewCard>
</template>
