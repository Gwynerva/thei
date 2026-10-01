<script lang="ts" setup>
import type { MediaPlayback } from '#layers/thei/shared/media';
import {
  contentEntityHasIcon,
  externalLinkFromResolved,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import EntityLinkPreviewCard from './EntityLinkPreviewCard.vue';

/**
 * A resolved link as a card, whatever it turned out to be: an entity, a
 * site, one the reader may not open, one that no longer exists — or one
 * still being asked about. Every state is laid out to the same measures, and
 * every state carries the owner's note on the link (`note`, or the `note`
 * slot), so a note being written never vanishes while the target is asked
 * about.
 */
const props = defineProps<{
  result?: ResolvedContentLink;
  /** What to call the link while it is still being asked about. */
  label?: string;
  /** The owner's note, as typed. */
  note?: string;
  loading?: boolean;
  interactive: boolean;
  playback?: MediaPlayback;
  flush?: boolean;
  continuousProjectMedia?: boolean;
}>();

const slots = defineSlots<{ note?(): unknown }>();
const externalLink = computed(() => externalLinkFromResolved(props.result));
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
    :href="result.href"
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
  >
    <template v-if="slots.note" #note><slot name="note" /></template>
  </ExternalLinkPreviewCard>
  <div
    v-else
    class="flex w-full min-w-0 items-center gap-xs rounded-normal border"
    :class="[
      flush ? 'min-h-16' : 'min-h-18 p-sm',
      result?.state === 'broken'
        ? 'border-border-error bg-bg-error text-text-error'
        : result?.state === 'restricted'
          ? 'border-border-1 bg-bg-3 text-text-3'
          : 'border-border-1 bg-bg-2 text-text-1',
    ]"
  >
    <span
      class="flex size-12 shrink-0 items-center justify-center rounded-sm"
      :class="[
        result?.state === 'broken' || result?.state === 'restricted'
          ? 'bg-bg-2'
          : 'animate-pulse bg-bg-3 text-text-3',
        { 'm-xs mr-0': flush },
      ]"
      aria-hidden="true"
    >
      <Icon
        :name="
          result?.state === 'broken'
            ? 'link-broken'
            : result?.state === 'restricted'
              ? 'lock-partial'
              : 'link'
        "
      />
    </span>
    <span
      class="flex min-w-0 flex-1 flex-col"
      :class="flush ? 'my-xs mr-xs gap-0.5' : 'gap-1'"
    >
      <span
        class="truncate font-semibold"
        :class="flush ? 'text-sm' : 'text-base'"
      >
        {{
          result?.state === 'broken' || result?.state === 'restricted'
            ? phrase.content_link_broken_title
            : label
        }}
      </span>
      <span
        v-if="result?.state === 'broken'"
        class="line-clamp-2"
        :class="flush ? 'text-sm' : 'text-[0.9375rem] leading-snug'"
      >
        {{ phrase.content_link_broken_description }}
      </span>
      <span
        v-else-if="!result || result.state !== 'restricted'"
        class="text-text-3"
        :class="flush ? 'text-sm' : 'text-[0.9375rem] leading-snug'"
      >
        {{ phrase.content_link_loading }}
      </span>
      <span v-if="slots.note || note" class="mt-0.5 block text-sm">
        <slot name="note"><ContentLinkNote :note /></slot>
      </span>
    </span>
  </div>
</template>
