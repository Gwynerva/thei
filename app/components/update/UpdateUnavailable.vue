<script lang="ts" setup>
/**
 * What a visitor sees while the site is closed for an update: only that it
 * is unavailable for now. How the update goes, and why it may have stopped,
 * is for the admin's update screen.
 */
</script>

<template>
  <section
    class="flex flex-col items-center gap-sm rounded-normal border
      border-border-1 bg-bg-2 p-lg text-center shadow-xl"
    role="status"
  >
    <Icon name="moon" class="text-4xl text-accent" />
    <h1 class="text-xl font-bold">{{ phrase.update_unavailable_title }}</h1>
    <p class="text-text-2">{{ phrase.update_unavailable_note }}</p>
  </section>
</template>
