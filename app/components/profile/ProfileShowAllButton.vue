<script setup lang="ts">
defineProps<{ expanded: boolean }>();
const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="cursor-pointer text-sm font-semibold text-accent underline
      decoration-accent/0 transition-colors hocus:decoration-accent/60"
    :aria-expanded="expanded"
    @click="emit('click')"
  >
    {{ expanded ? phrase.profile_hide : phrase.profile_show_all }}
  </button>
</template>
