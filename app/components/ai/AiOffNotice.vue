<script lang="ts" setup>
/**
 * What a tab about AI shows while AI is off: that it is, and the way to the
 * switch.
 */
</script>

<template>
  <p
    class="flex flex-wrap items-center gap-x-sm gap-y-xs text-sm text-text-3"
    data-ai-off
  >
    <span>{{ phrase.ai_off_notice }}</span>
    <TheiLink
      to="/admin/ai/?tab=connection"
      class="flex items-center gap-xs font-semibold text-text-2
        hocus:text-accent"
    >
      <Icon name="power" />{{ phrase.ai_tab_connection }}
    </TheiLink>
  </p>
</template>
