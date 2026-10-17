<script lang="ts" setup>
/**
 * Back from a session's screen to the list of sessions: on a phone, where
 * the two are screens of their own. From `sm` on they stand side by side,
 * and it is not shown.
 */
</script>

<template>
  <Button
    variant="secondary"
    size="icon-sm"
    class="bg-transparent sm:hidden pointer-coarse:size-11"
    :aria-label="phrase.ai_sessions_back"
    :data-title-popup="phrase.ai_sessions_back"
    data-session-back
  >
    <Icon name="chevron-left" />
  </Button>
</template>
