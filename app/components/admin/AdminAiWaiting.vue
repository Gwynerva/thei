<script lang="ts" setup>
import type { AiSessionItem } from '#layers/thei/shared/ai';

/**
 * Sessions that wait for the owner — an action undecided, a question
 * unanswered — on the dashboard, a few at a time. Nothing at all while none
 * waits, or with AI off.
 */
const waiting = useAiWaiting();
const sessions = ref<AiSessionItem[]>([]);

async function load() {
  if (!waiting.value) {
    sessions.value = [];
    return;
  }
  sessions.value = await aiApi.waitingSessions();
}
onMounted(load);
watch(waiting, load);
</script>

<template>
  <!-- It comes once the sessions are read, after the page: it fades in
       rather than appearing at a stroke. -->
  <TransitionFade>
    <Box
      v-if="sessions.length"
      class="flex flex-col gap-1 p-sm"
      data-ai-waiting
    >
      <TheiLink
        to="/admin/ai/"
        class="flex items-center gap-xs px-1 pb-1 text-sm font-semibold
          transition-colors hocus:text-accent"
      >
        <Icon name="sparkles" class="text-accent" />
        {{ phrase.ai_session_groups.waiting }}
        <span
          class="inline-flex h-5 min-w-5 items-center justify-center
            rounded-full bg-accent px-1.5 text-xs font-bold text-white
            dark:text-bg-1"
          >{{ waiting }}</span
        >
      </TheiLink>
      <AiSessionLink v-for="item in sessions" :key="item.sessionUuid" :item />
    </Box>
  </TransitionFade>
</template>
