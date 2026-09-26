<script lang="ts" setup>
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

/**
 * A quiet reminder in the header of a form whose entity has no tags yet
 * while some clearly fit it. Tags are the part of an entry that is easiest to
 * forget, and the block that holds them sits far down the form.
 */
const { count } = defineProps<{ count: number }>();
const emit = defineEmits<{ reveal: [] }>();
</script>

<template>
  <Button
    v-if="count"
    variant="secondary"
    class="flex items-center gap-1 font-semibold"
    :aria-label="phrase.tag_nudge(count)"
    v-bind="titlePopup(phrase.tag_nudge_hint)"
    @click="emit('reveal')"
  >
    <Icon name="tag" class="shrink-0" />
    <span class="sm:hidden">{{ count }}</span>
    <span class="hidden sm:inline">{{ phrase.tag_nudge(count) }}</span>
  </Button>
</template>
