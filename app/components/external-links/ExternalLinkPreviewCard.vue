<script lang="ts" setup>
import {
  externalLinkHostname,
  normalizeExternalLinkUrl,
  type ExternalLinkPreview,
} from '#layers/thei/shared/external-link';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import type { MediaPlayback } from '#layers/thei/shared/media';

/**
 * The card a link to another site is shown as: the site's favicon, its
 * title and its description. It is laid out to the same measures as the
 * card of an internal link, so the two sit together in one flow.
 */
const props = defineProps<{
  link?: ExternalLinkPreview;
  url?: string;
  loading?: boolean;
  errorText?: string;
  loadingText?: string;
  flush?: boolean;
  interactive: boolean;
  playback?: MediaPlayback;
}>();

const title = computed(
  () =>
    props.link?.title ||
    props.errorText ||
    externalLinkHostname(props.url ?? props.link?.url ?? ''),
);
const description = computed(() => props.link?.description);
const iconMedia = computed(() => props.link?.faviconMedia);

/**
 * How the details were obtained, when that is worth knowing: a site that
 * did not answer can be refreshed later. Public data never carries a
 * status, so visitors never see this line.
 */
const hint = computed(() => {
  if (props.link?.status === 'fallback')
    return phrase.value.external_link_fallback;
  if (props.link?.status === 'archived')
    return phrase.value.external_link_archived;
  return undefined;
});

const interactiveHref = computed(() => {
  if (!props.interactive) return undefined;
  try {
    return normalizeExternalLinkUrl(props.link?.url ?? props.url);
  } catch {
    return undefined;
  }
});

const accentColor = computed(() =>
  imageAccentCssColor(iconMedia.value?.accent, 'var(--color-text-3)'),
);
const { engaged, events: mediaEvents } = useMediaInteraction();
</script>

<template>
  <div class="@container w-full min-w-0">
    <component
      v-on="mediaEvents"
      :is="interactiveHref ? 'a' : 'div'"
      :href="interactiveHref"
      :target="interactiveHref ? '_blank' : undefined"
      :rel="interactiveHref ? 'noopener noreferrer' : undefined"
      class="external-link-preview flex min-h-16 w-full min-w-0 items-center
        gap-xs rounded-normal border border-border-1 bg-bg-2 text-text-1
        no-underline transition-colors"
      :class="[
        { 'cursor-pointer': interactiveHref },
        flush ? '' : 'px-sm py-xs',
      ]"
      :style="{ '--external-link-accent': accentColor }"
    >
      <Media
        v-if="iconMedia"
        v-bind="iconMedia"
        :engaged
        :playback="playback ?? 'manual'"
        class="size-12 shrink-0 rounded-sm object-cover opacity-100
          @max-[24rem]:size-10"
        :class="{ 'm-xs mr-0': flush }"
      />
      <div
        v-else
        class="flex size-12 shrink-0 items-center justify-center rounded-sm
          bg-bg-3 text-xl text-text-3 @max-[24rem]:size-10"
        :class="{ 'm-xs mr-0': flush, 'animate-pulse': loading }"
        aria-hidden="true"
      >
        <Icon name="globe" />
      </div>
      <div
        class="flex min-w-0 flex-1 flex-col gap-0.5"
        :class="{ 'my-xs': flush }"
      >
        <p class="truncate text-sm font-semibold">{{ title }}</p>
        <p v-if="description" class="line-clamp-2 text-sm text-text-3">
          {{ description }}
        </p>
        <p v-else-if="loading && loadingText" class="text-sm text-text-3">
          {{ loadingText }}
        </p>
        <p v-if="hint && !loading" class="text-xs text-text-3 italic">
          {{ hint }}
        </p>
      </div>
    </component>
  </div>
</template>

<style scoped>
.external-link-preview:is(a) {
  text-decoration: none;
}

.external-link-preview:is(a):is(:hover, :focus-visible) {
  border-color: color-mix(
    in oklab,
    var(--external-link-accent) 80%,
    var(--color-border-1)
  );
  background: color-mix(
    in oklab,
    var(--external-link-accent) 16%,
    var(--color-bg-2)
  );
  color: var(--color-text-1);
}
</style>
