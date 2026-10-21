<script lang="ts" setup>
/**
 * Where a ✦ was asked — a field's or a text's — while its session answers,
 * and once it answered with nothing to propose: that it is at work, with a
 * way to the session and to stop it; then that nothing was proposed, the
 * way to the session, and why in the model's own last words. Its parts are
 * marked for the page as `data-<mark>-asking`, `-stop` and `-answered`.
 */
const props = defineProps<{
  /** The session answering now. */
  asking?: string;
  /** The session that answered with nothing to propose. */
  answered?: string;
  /** Its model's last words. */
  said?: string;
  /** That nothing was proposed, as the place says it. */
  nothing: string;
  mark: string;
}>();
const emit = defineEmits<{ stop: [] }>();

const marked = (part: string) => ({ [`data-${props.mark}-${part}`]: '' });
</script>

<template>
  <div
    v-if="asking"
    class="flex min-h-9 items-center gap-xs rounded-sm border border-border-1
      bg-bg-1 py-0.5 pr-0.5 pl-2.5 text-sm"
    v-bind="marked('asking')"
  >
    <AiRunningDots />
    <span class="min-w-0 flex-1">{{ phrase.ai_field_asking }}</span>
    <TheiLink
      :to="sessionLocation(asking)"
      class="shrink-0 text-xs text-text-2 underline decoration-text-2/35
        underline-offset-2 hocus:text-accent"
      >{{ phrase.ai_field_ask_open }}</TheiLink
    >
    <AiStopButton v-bind="marked('stop')" @click="emit('stop')" />
  </div>
  <div
    v-else-if="answered"
    class="flex flex-col gap-1 px-1 text-xs text-text-2"
    v-bind="marked('answered')"
  >
    <p class="flex items-center gap-1">
      <Icon name="ai-chat" class="shrink-0" />
      <span class="min-w-0 flex-1">{{ nothing }}</span>
      <TheiLink
        :to="sessionLocation(answered)"
        class="-my-3 inline-flex shrink-0 items-center py-3 underline
          decoration-text-2/35 underline-offset-2 hocus:text-accent"
        >{{ phrase.ai_field_ask_open }}</TheiLink
      >
    </p>
    <!-- Why, as the model put it: no need to leave the form for it. -->
    <p
      v-if="said"
      class="line-clamp-4 border-l-2 border-border-2 pl-2 text-sm text-text-1"
    >
      {{ said }}
    </p>
  </div>
</template>
