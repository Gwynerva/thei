<script setup lang="ts">
defineProps<{ title: string }>();
</script>
<template>
  <section
    class="min-w-0 rounded-normal border border-border-1 bg-bg-2 p-md shadow-md
      shadow-shadow-1"
  >
    <h2
      class="mb-md text-xs font-semibold tracking-tight text-text-3 uppercase"
    >
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
