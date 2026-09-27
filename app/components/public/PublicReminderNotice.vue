<script lang="ts" setup>
/**
 * The owner's reminder, shown under the title of the entity it is about.
 *
 * Like the notes it is owner-only: the server leaves the field out entirely
 * for a visitor, so an empty prop is the normal case rather than an error.
 * The text keeps the lines it was typed in: a reminder is often a short list.
 */
defineProps<{ reminder?: string }>();
</script>

<template>
  <section
    v-if="reminder"
    class="flex flex-col gap-xs rounded-normal border border-border-warning
      bg-bg-warning p-sm text-sm text-text-warning"
  >
    <h2 class="flex items-center gap-xs font-semibold">
      <Icon name="warning" class="shrink-0" />
      <span>{{ phrase.entity_reminder }}</span>
    </h2>
    <p class="min-w-0 wrap-break-word whitespace-pre-line">
      {{ publicText(reminder) }}
    </p>
  </section>
</template>
