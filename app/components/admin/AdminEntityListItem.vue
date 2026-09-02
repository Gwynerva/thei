<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

const props = defineProps<{
  entityType: 'project' | 'event' | 'page';
  title: string;
  summary: string;
  previewMedia?: MediaDescriptor;
  editTo: string;
  compact?: boolean;
}>();
</script>

<template>
  <div
    class="flex min-w-0 items-stretch border-b border-border-1/60 transition
      last:border-b-0 hocus:bg-accent/8"
  >
    <TheiLink
      :to="editTo"
      class="group relative flex min-w-0 flex-1 items-center overflow-hidden
        py-xs pl-sm"
      :class="props.compact ? 'min-h-14' : 'min-h-16'"
    >
      <span
        class="entity-preview absolute inset-y-0 left-0 w-24 bg-bg-accent"
        aria-hidden="true"
      >
        <Media
          v-if="previewMedia"
          v-bind="previewMedia"
          class="size-full opacity-75 transition group-hocus:opacity-100"
        />
        <span
          v-else
          class="flex size-full items-center pl-sm text-2xl text-text-3"
        >
          <Icon :name="entityType" />
        </span>
      </span>
      <span class="relative ml-10 min-w-0 flex-1 py-1">
        <span
          class="block font-semibold transition group-hocus:text-accent"
          :class="
            props.compact ? 'truncate text-sm' : 'line-clamp-2 wrap-break-word'
          "
        >
          {{ title }}
        </span>
        <span
          class="block text-text-2"
          :class="
            props.compact
              ? 'truncate text-xs'
              : 'line-clamp-1 text-sm wrap-break-word sm:line-clamp-2'
          "
        >
          {{ summary }}
        </span>
      </span>
    </TheiLink>

    <div
      v-if="$slots.badges"
      class="hidden w-20 shrink-0 items-center justify-end gap-1 px-xs text-base
        sm:flex [&>*]:size-4 [&>*]:shrink-0"
    >
      <slot name="badges"></slot>
    </div>
    <div
      v-if="$slots.date"
      class="hidden w-36 shrink-0 items-center px-xs text-text-2 sm:flex"
    >
      <slot name="date"></slot>
    </div>
    <div
      v-if="$slots.size"
      class="flex w-24 shrink-0 items-center px-xs text-sm whitespace-nowrap
        text-text-2"
    >
      <slot name="size"></slot>
    </div>
    <div
      v-if="$slots.action"
      class="hidden w-12 shrink-0 items-center justify-center pr-sm sm:flex"
    >
      <slot name="action"></slot>
    </div>
  </div>
</template>

<style scoped>
.entity-preview {
  mask-image: linear-gradient(
    to right,
    #000 0%,
    rgb(0 0 0 / 70%) 20%,
    rgb(0 0 0 / 10%) 75%,
    transparent 100%
  );
}
</style>
