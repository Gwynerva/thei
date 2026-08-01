<script lang="ts" setup>
import {
  externalLinkHostname,
  type ExternalLink,
} from '#layers/thei/shared/external-link';

const props = defineProps<{
  link?: ExternalLink;
  url?: string;
  loading?: boolean;
  errorText?: string;
  loadingText?: string;
}>();

const title = computed(
  () =>
    props.link?.title ||
    props.errorText ||
    (props.url ? externalLinkHostname(props.url) : ''),
);

const accentColor = computed(() => {
  const hue = props.link?.faviconMedia.accentHue;

  return hue === undefined
    ? 'var(--color-text-3)'
    : `oklch(var(--lightness-accent) var(--chroma-accent) ${hue})`;
});
</script>

<template>
  <div class="@container w-full min-w-0">
    <component
      :is="link ? 'a' : 'div'"
      :href="link?.url"
      :target="link ? '_blank' : undefined"
      :rel="link ? 'noopener noreferrer' : undefined"
      class="external-link-preview flex min-h-16 w-full min-w-0 items-center
        gap-xs rounded-normal border border-border-1 bg-bg-2 p-xs text-text-1
        no-underline transition-colors"
      :class="{ 'cursor-pointer': link }"
      :style="{ '--external-link-accent': accentColor }"
    >
      <Media
        v-if="link?.faviconMedia"
        v-bind="link.faviconMedia"
        class="size-12 shrink-0 rounded-sm object-cover opacity-100
          @max-[24rem]:size-10"
      />
      <div
        v-else
        class="flex size-12 shrink-0 items-center justify-center rounded-sm
          bg-bg-3 text-xl text-text-3 @max-[24rem]:size-10"
        :class="{ 'animate-pulse': loading }"
        aria-hidden="true"
      >
        <Icon name="external-link" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold @max-[24rem]:text-xs">
          {{ title }}
        </p>
        <p v-if="link?.description" class="line-clamp-2 text-xs text-text-3">
          {{ link.description }}
        </p>
        <p v-else-if="loading && loadingText" class="text-xs text-text-3">
          {{ loadingText }}
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
