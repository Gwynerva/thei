<script lang="ts" setup>
import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * What a check's last run left: the session going on now, the one it
 * started last with what waits in it, or that it never ran.
 */
const props = defineProps<{
  template: AiTemplateItem;
  /** Its run is being started. */
  starting?: boolean;
}>();

const running = computed(
  () => props.starting || props.template.lastSession?.state === 'running',
);
</script>

<template>
  <TheiLink
    v-if="running && template.lastSession"
    :to="{
      path: '/admin/ai/',
      query: { session: template.lastSession.sessionUuid },
    }"
    class="inline-flex items-center gap-1 text-text-2 underline
      decoration-text-2/35 underline-offset-2 transition hocus:text-accent"
  >
    <AiRunningDots />{{ phrase.ai_template_running }}
  </TheiLink>
  <TheiLink
    v-else-if="template.lastSession"
    :to="{
      path: '/admin/ai/',
      query: { session: template.lastSession.sessionUuid },
    }"
    class="inline-flex items-center gap-1 text-text-2 underline
      decoration-text-2/35 underline-offset-2 transition hocus:text-accent"
    data-template-last
  >
    <Icon name="ai-chat" class="shrink-0 text-text-3" />{{
      shortWhen(template.lastSession.startedAt)
    }}
    <template v-if="template.lastSession.waiting">
      ·
      <b class="font-semibold text-accent">{{
        phrase.ai_session_waiting(template.lastSession.waiting)
      }}</b>
    </template>
  </TheiLink>
  <span v-else class="inline-flex items-center gap-1 text-text-3">
    <Icon name="ai-chat" class="shrink-0" />{{ phrase.ai_template_never_run }}
  </span>
</template>
