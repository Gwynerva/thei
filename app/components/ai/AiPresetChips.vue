<script lang="ts" setup>
import type { AiPresetItem } from '#layers/thei/shared/ai-template';

/**
 * The ready-made requests to start from, as a row of chips under a small
 * heading: one chosen puts its words into the message, to add to and send.
 */
defineProps<{ presets: readonly AiPresetItem[]; heading: string }>();
const emit = defineEmits<{ choose: [preset: AiPresetItem] }>();
</script>

<template>
  <div v-if="presets.length" class="flex flex-col gap-1.5" data-ai-presets>
    <p class="flex items-center gap-1.5 text-xs font-bold text-text-2">
      <Icon name="template" class="shrink-0" />{{ heading }}
    </p>
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="preset in presets"
        :key="preset.templateId"
        variant="secondary"
        class="flex h-7 max-w-full min-w-0 items-center gap-1 px-2 text-xs
          pointer-coarse:h-11"
        :data-ai-preset="preset.templateId"
        :data-title-popup="publicText(preset.instruction)"
        @click="emit('choose', preset)"
      >
        <Icon name="template" class="shrink-0" />
        <span class="truncate">{{ publicText(preset.title) }}</span>
      </Button>
    </div>
  </div>
</template>
