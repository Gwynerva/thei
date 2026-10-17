<script lang="ts" setup>
import type { AiSessionItem } from '#layers/thei/shared/ai';

/**
 * A session as a menu or a box names it, leading to it: where it came from,
 * its title, what waits in it and what was applied, and when it was last
 * active.
 */
defineProps<{ item: AiSessionItem }>();
</script>

<template>
  <TheiLink
    :to="`/admin/ai/?session=${item.sessionUuid}`"
    class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5
      rounded-sm px-2 py-1.5 transition-colors pointer-coarse:min-h-11
      hocus:bg-bg-accent"
    :data-title-popup="sessionTitle(item)"
    data-title-popup-clipped
    :data-session-link="item.sessionUuid"
  >
    <span
      class="row-span-2 flex size-7 items-center justify-center rounded-full
        bg-bg-3 text-text-2"
    >
      <Icon :name="sessionSource(item).icon" />
    </span>
    <span class="truncate text-sm font-semibold" data-title-popup-clip>{{
      sessionTitle(item)
    }}</span>
    <span class="flex min-w-0 flex-wrap gap-1 text-xs text-text-2">
      <AiPill v-if="item.waiting">{{
        phrase.ai_session_waiting(item.waiting)
      }}</AiPill>
      <AiPill v-if="item.applied" tone="success">{{
        phrase.ai_session_applied_count(item.applied)
      }}</AiPill>
      <span class="inline-flex h-5 items-center">{{
        shortWhen(item.lastActiveAt)
      }}</span>
    </span>
  </TheiLink>
</template>
