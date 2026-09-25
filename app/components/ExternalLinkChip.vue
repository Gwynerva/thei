<script lang="ts" setup>
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import type { MediaDescriptor } from '#layers/thei/shared/media';

const props = defineProps<{
  link: { url: string; name: string };
  /** The site's icon, from the link's stored record when there is one. */
  faviconMedia?: MediaDescriptor;
  interactive?: boolean;
  loading?: boolean;
  size?: 'default' | 'compact';
}>();

const emit = defineEmits<{ click: [event: MouseEvent] }>();
const component = computed(() =>
  props.interactive ? 'button' : props.link.url ? 'a' : 'div',
);

const accentColor = computed(() =>
  imageAccentCssColor(props.faviconMedia?.accent, 'var(--color-text-3)'),
);
</script>

<template>
  <component
    :is="component"
    :type="interactive ? 'button' : undefined"
    :href="!interactive ? link.url : undefined"
    :target="!interactive ? '_blank' : undefined"
    :rel="!interactive ? 'noopener noreferrer' : undefined"
    class="external-link-chip inline-flex max-w-64 items-center gap-2 rounded-sm
      border border-border-1 font-semibold text-text-1 transition"
    :style="{ '--external-link-accent': accentColor }"
    :class="[
      size === 'compact' ? 'h-8 px-xs text-xs' : 'h-9 px-xs text-xs',
      {
        'cursor-pointer': interactive,
        'animate-pulse': loading,
      },
    ]"
    @click="emit('click', $event)"
  >
    <Media
      v-if="faviconMedia"
      v-bind="faviconMedia"
      :class="size === 'compact' ? 'size-4' : 'size-5'"
      class="shrink-0 rounded-xs"
    />
    <span
      v-else
      :class="size === 'compact' ? 'size-4' : 'size-5'"
      class="flex shrink-0 items-center justify-center rounded-xs bg-bg-3
        text-text-2"
      aria-hidden="true"
    >
      <Icon name="external-link" />
    </span>
    <span class="min-w-0 flex-1 truncate">{{ link.name }}</span>
    <slot />
  </component>
</template>

<style scoped>
.external-link-chip {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--external-link-accent) 16%, var(--color-bg-3)) 0%,
    var(--color-bg-3) 72%
  );
}

.external-link-chip::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--external-link-accent) 16%, var(--color-bg-3)) 0%,
    color-mix(in oklab, var(--external-link-accent) 8%, var(--color-bg-3)) 72%
  );
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease;
}

.external-link-chip > * {
  position: relative;
  z-index: 1;
}

.external-link-chip:is(:hover, :focus-visible) {
  border-color: color-mix(
    in oklab,
    var(--external-link-accent) 80%,
    transparent
  );
}

.external-link-chip:is(:hover, :focus-visible)::before {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .external-link-chip::before {
    transition: none;
  }
}
</style>
