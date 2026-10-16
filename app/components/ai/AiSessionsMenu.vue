<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';
import type { IconName } from '#thei/icons';
import type { AiSessionItem } from '#layers/thei/shared/ai';

/**
 * The menu a ✦ opens: what it can start, at the top, and under a heading
 * the sessions it lists — a word when there are none, and a way to the
 * rest of them. A session answering may be stopped from the list, where
 * `stoppable` allows it.
 */
defineProps<{
  heading: string;
  headingIcon: IconName;
  sessions: readonly AiSessionItem[];
  /** Said under the heading while none is listed. */
  empty?: string;
  /** Where the rest of them are, when the list is not all of them. */
  more?: { to: RouteLocationRaw; label: string };
  /** Which sessions answering get a button that stops them. */
  stoppable?: (item: AiSessionItem) => boolean;
}>();
const emit = defineEmits<{ close: []; stop: [sessionUuid: string] }>();
</script>

<template>
  <!-- In a popup, which draws its surface: what starts, then the list. -->
  <div class="flex flex-col">
    <div class="flex flex-col gap-xs border-b border-border-1 p-sm">
      <slot />
    </div>
    <div
      class="flex scrollbar-mini max-h-80 flex-col gap-0.5 overflow-y-auto p-xs"
      data-ai-menu-sessions
    >
      <p
        class="flex items-center gap-1.5 px-xs pt-1 pb-0.5 text-xs font-bold
          text-text-2"
      >
        <Icon :name="headingIcon" class="shrink-0" />{{ heading }}
      </p>
      <div
        v-for="item in sessions"
        :key="item.sessionUuid"
        class="flex min-w-0 items-center"
      >
        <AiSessionLink :item class="min-w-0 flex-1" @click="emit('close')" />
        <AiStopButton
          v-if="item.state === 'running' && stoppable?.(item)"
          :data-session-stop="item.sessionUuid"
          @click="emit('stop', item.sessionUuid)"
        />
      </div>
      <p v-if="empty" class="px-xs pb-1 text-sm text-text-3">
        {{ empty }}
      </p>
      <TheiLink
        v-if="more"
        :to="more.to"
        class="flex items-center px-xs py-1.5 text-sm font-semibold text-accent
          pointer-coarse:min-h-11 hocus:underline"
        data-ai-menu-more
        @click="emit('close')"
      >
        {{ more.label }}
      </TheiLink>
    </div>
  </div>
</template>
