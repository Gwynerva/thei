<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

const props = defineProps<{
  entityType?: 'project' | 'event';
  title: string;
  summary: string;
  iconMedia?: MediaDescriptor;
  href?: string;
  interactive: boolean;
  flush?: boolean;
}>();
</script>

<template>
  <component
    :is="href && interactive ? 'a' : 'div'"
    :href="href && interactive ? href : undefined"
    :target="href && interactive ? '_blank' : undefined"
    :rel="href && interactive ? 'noopener noreferrer' : undefined"
    class="entity-link-preview group relative flex min-h-16 w-full min-w-0
      items-center gap-xs overflow-hidden rounded-normal border border-border-1
      bg-bg-2 text-text-1 no-underline transition-colors"
    :class="[
      {
        'cursor-pointer hocus:border-border-3 hocus:bg-bg-3':
          href && interactive,
      },
      flush ? '' : 'p-xs',
    ]"
  >
    <span
      class="entity-preview absolute inset-y-0 left-0 w-32 bg-bg-accent
        [--preview-mask-end:60%] [--preview-mask-soft-alpha:10%]
        [--preview-mask-soft:40%] [--preview-mask-start-alpha:100%]
        [--preview-mask-strong-alpha:70%] [--preview-mask-strong:10%]
        sm:[--preview-mask-end:80%] sm:[--preview-mask-soft:60%]
        sm:[--preview-mask-strong:25%]"
      aria-hidden="true"
    >
      <Media
        v-if="iconMedia"
        v-bind="iconMedia"
        class="size-full opacity-75 transition group-hocus:opacity-100"
      />
      <span
        v-else
        class="flex size-full items-center justify-start pl-xs text-text-3"
      >
        <Icon :name="entityType ?? 'project'" class="entity-type-icon" />
      </span>
    </span>
    <span
      class="entity-preview-text relative ml-md min-w-0 flex-1 sm:ml-8"
      :class="flush ? 'my-xs mr-xs' : undefined"
    >
      <span
        class="flex items-center gap-1 truncate text-sm font-semibold
          sm:text-base"
        ><Icon
          :name="entityType ?? 'project'"
          class="entity-type-icon shrink-0 text-xs text-text-2"
        />{{ title }}</span
      >
      <span class="line-clamp-2 block text-sm text-text-3">{{ summary }}</span>
    </span>
  </component>
</template>

<style scoped>
.entity-link-preview:is(a) {
  text-decoration: none;
}

.entity-preview {
  mask-image: linear-gradient(
    to right,
    rgb(0 0 0 / var(--preview-mask-start-alpha)) 0%,
    rgb(0 0 0 / var(--preview-mask-strong-alpha)) var(--preview-mask-strong),
    rgb(0 0 0 / var(--preview-mask-soft-alpha)) var(--preview-mask-soft),
    transparent var(--preview-mask-end)
  );
}

.entity-preview-text {
  text-shadow:
    0 0 0.5em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.12em 0.45em var(--color-bg-2);
}

.entity-type-icon {
  filter: drop-shadow(0 0 0.3em var(--color-bg-2))
    drop-shadow(0 0.08em 0.24em var(--color-bg-2));
}
</style>
