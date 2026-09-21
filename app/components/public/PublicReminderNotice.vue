<script lang="ts" setup>
/**
 * The owner's reminder, shown under the title of the entity it is about.
 *
 * Like the notes it is owner-only: the server leaves the field out entirely
 * for a visitor, so an empty prop is the normal case rather than an error.
 */
defineProps<{ reminder?: string }>();
</script>

<template>
  <p
    v-if="reminder"
    class="flex flex-wrap items-start gap-xs rounded-normal border
      border-border-warning bg-bg-warning p-sm text-sm text-text-warning"
  >
    <Icon name="warning" class="mt-0.5 shrink-0" />
    <span class="min-w-0 wrap-break-word">{{ reminder }}</span>
  </p>
</template>
