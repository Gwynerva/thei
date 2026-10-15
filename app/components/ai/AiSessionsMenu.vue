<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';
import type { IconName } from '#thei/icons';
import type { AiSessionItem } from '#layers/thei/shared/ai';

/**
 * The menu a ✦ opens: what it can start, at the top, and under a heading
 * the sessions it lists — a word when there are none, and a way to the
 * rest of them.
 */
defineProps<{
  heading: string;
  headingIcon: IconName;
  sessions: readonly AiSessionItem[];
  /** Said under the heading while none is listed. */
  empty?: string;
  /** Where the rest of them are, when the list is not all of them. */
  more?: { to: RouteLocationRaw; label: string };
}>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="flex flex-col rounded-normal border border-border-1 bg-bg-2">
    <div class="flex flex-col gap-xs border-b border-border-1 p-sm">
      <slot />
    </div>
    <div
      class="flex scrollbar-mini max-h-80 flex-col overflow-y-auto p-1"
      data-ai-menu-sessions
    >
      <p
        class="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-bold
          text-text-2"
      >
        <Icon :name="headingIcon" class="shrink-0" />{{ heading }}
      </p>
      <AiSessionLink
        v-for="item in sessions"
        :key="item.sessionUuid"
        :item
        @click="emit('close')"
      />
      <p v-if="empty" class="px-2 pb-2 text-sm text-text-3">
        {{ empty }}
      </p>
      <TheiLink
        v-if="more"
        :to="more.to"
        class="flex items-center px-2 py-1.5 text-sm font-semibold text-accent
          pointer-coarse:min-h-11 hocus:underline"
        data-ai-menu-more
        @click="emit('close')"
      >
        {{ more.label }}
      </TheiLink>
    </div>
  </div>
</template>
