<script lang="ts" setup>
import type { MediaPlayback } from '#layers/thei/shared/media';
import {
  contentEntityHasIcon,
  externalLinkFromResolved,
  withLinkFragment,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import EntityLinkPreviewCard from './EntityLinkPreviewCard.vue';
import LinkPreviewCard from '#layers/thei/app/components/LinkPreviewCard.vue';

/**
 * A resolved link as a card, whatever it turned out to be: an entity, a
 * site, one the reader may not open, one that no longer exists — or one
 * still being asked about. Every state is the same card
 * (`LinkPreviewCard`), and every state carries the owner's note on the link
 * (`note`, or the `note` slot), so a note being written never vanishes while
 * the target is asked about.
 */
const props = defineProps<{
  result?: ResolvedContentLink;
  /** What to call the link while it is still being asked about. */
  label?: string;
  /** The owner's note, as typed. */
  note?: string;
  /** Where inside an entity the link leads, if anywhere. */
  fragment?: string;
  interactive: boolean;
  playback?: MediaPlayback;
  /** Laid on a popup's surface: no border or ground of its own. */
  flush?: boolean;
  continuousProjectMedia?: boolean;
}>();

const slots = defineSlots<{ note?(): unknown }>();
const externalLink = computed(() => externalLinkFromResolved(props.result));
const unavailable = computed(
  () =>
    props.result?.state === 'broken' || props.result?.state === 'restricted',
);
</script>

<template>
  <EntityLinkPreviewCard
    v-if="result?.state === 'resolved' && result.kind === 'entity'"
    :entity-type="result.entityType"
    :title="result.title"
    :summary="result.summary"
    :note
    :date="result.date"
    :parent="result.parent"
    :icon-media="result.media"
    :href="sitePath(withLinkFragment(result.href, fragment))"
    :interactive="interactive"
    :playback
    :loop="continuousProjectMedia && contentEntityHasIcon(result.entityType)"
    :autoplay-reduced-motion="
      continuousProjectMedia && contentEntityHasIcon(result.entityType)
    "
    :flush="flush"
    :compact="flush"
  >
    <template v-if="slots.note" #note><slot name="note" /></template>
  </EntityLinkPreviewCard>
  <ExternalLinkPreviewCard
    v-else-if="result?.state === 'resolved' && result.kind === 'external'"
    :link="externalLink"
    :url="result.href"
    :note
    :interactive="interactive"
    :playback
    :flush="flush"
    :compact="flush"
  >
    <template v-if="slots.note" #note><slot name="note" /></template>
  </ExternalLinkPreviewCard>
  <!-- The glyph has no name here: the title or the line under it says the
       same words, and a screen reader would say them twice. -->
  <LinkPreviewCard
    v-else
    :kind="{
      icon:
        result?.state === 'broken'
          ? 'link-broken'
          : result?.state === 'restricted'
            ? 'lock-partial'
            : 'link',
    }"
    :title="unavailable ? phrase.content_link_broken_title : (label ?? '')"
    :summary="
      result?.state === 'broken'
        ? phrase.content_link_broken_description
        : result?.state === 'restricted'
          ? undefined
          : phrase.content_link_loading
    "
    :note
    :tone="
      result?.state === 'broken'
        ? 'error'
        : result?.state === 'restricted'
          ? 'muted'
          : undefined
    "
    :loading="!unavailable"
    :interactive="false"
    :flush="flush"
    :compact="flush"
  >
    <template v-if="slots.note" #note><slot name="note" /></template>
  </LinkPreviewCard>
</template>
