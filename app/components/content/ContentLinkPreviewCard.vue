<script lang="ts" setup>
import type { ResolvedContentLink } from '#layers/thei/shared/content-link';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import ProjectLinkPreviewCard from './ProjectLinkPreviewCard.vue';

const props = defineProps<{
  result?: ResolvedContentLink;
  label?: string;
  loading?: boolean;
  interactive: boolean;
  flush?: boolean;
}>();

const externalLink = computed<ExternalLink | undefined>(() => {
  const result = props.result;
  if (!result || result.state !== 'resolved' || result.kind !== 'external')
    return undefined;
  return {
    url: result.href,
    title: result.title,
    description: result.description,
    faviconMedia: result.iconMedia,
    touchedAt: 0,
  };
});
</script>

<template>
  <ProjectLinkPreviewCard
    v-if="
      result?.state === 'resolved' &&
      (result.kind === 'project' ||
        result.kind === 'event' ||
        result.kind === 'page')
    "
    :entity-type="result.kind"
    :title="result.title"
    :summary="result.summary"
    :icon-media="
      result.kind === 'event' ? result.previewMedia : result.iconMedia
    "
    :href="result.href"
    :interactive="interactive"
    :flush="flush"
  />
  <div
    v-else-if="result?.state === 'restricted'"
    class="flex min-h-16 w-full min-w-0 items-center gap-xs rounded-normal
      border border-border-1 bg-bg-3 p-xs text-text-3"
  >
    <span class="flex size-12 items-center justify-center rounded-sm bg-bg-2"
      ><Icon name="lock-partial"
    /></span>
    <span class="text-sm font-semibold">{{
      phrase.content_link_broken_title
    }}</span>
  </div>
  <ExternalLinkPreviewCard
    v-else-if="result?.state === 'resolved' && result.kind === 'external'"
    :link="externalLink"
    :url="result.href"
    :interactive="interactive"
    :flush="flush"
  />
  <div
    v-else-if="result?.state === 'broken'"
    class="flex min-h-16 w-full min-w-0 items-center gap-xs rounded-normal
      border border-border-error bg-bg-error p-xs text-text-error"
  >
    <span
      class="flex size-12 shrink-0 items-center justify-center rounded-sm
        bg-bg-2"
      aria-hidden="true"
    >
      <Icon name="link-broken" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-semibold">
        {{ phrase.content_link_broken_title }}
      </span>
      <span class="line-clamp-2 block text-xs">
        {{ phrase.content_link_broken_description }}
      </span>
    </span>
  </div>
  <div
    v-else
    class="flex min-h-16 w-full min-w-0 items-center gap-xs rounded-normal
      border border-border-1 bg-bg-2 p-xs text-text-1"
  >
    <span
      class="flex size-12 shrink-0 animate-pulse items-center justify-center
        rounded-sm bg-bg-3 text-text-3"
      aria-hidden="true"
    >
      <Icon name="link" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-semibold">{{ label }}</span>
      <span class="block text-xs text-text-3">
        {{ phrase.content_link_loading }}
      </span>
    </span>
  </div>
</template>
