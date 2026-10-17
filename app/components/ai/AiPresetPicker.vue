<script lang="ts" setup>
import type { AiPresetItem } from '#layers/thei/shared/ai-template';
import type { SelectOption } from '#layers/thei/app/components/field/FieldSelect.vue';

/**
 * The template to start from, chosen as any option is: one of the owner's
 * puts its words into the message, to add to and send; a built-in check,
 * marked by its own icon, runs. It shows the template the message's words
 * began from, while they are there.
 */
const props = defineProps<{
  presets: readonly AiPresetItem[];
  /** The template the message's words began from, if any. */
  chosen?: string;
}>();
const emit = defineEmits<{ choose: [preset: AiPresetItem] }>();

const options = computed<SelectOption[]>(() =>
  props.presets.map((preset, index) => ({
    value: preset.templateId,
    label: publicText(preset.title),
    icon: preset.builtin ? 'list-check' : 'template',
    // The built-in checks, then the owner's own.
    divider:
      Boolean(preset.builtin) && !props.presets[index + 1]?.builtin
        ? index < props.presets.length - 1
        : false,
  })),
);

const value = computed({
  get: () => props.chosen ?? '',
  set: (templateId: string) => {
    const preset = props.presets.find((item) => item.templateId === templateId);
    if (preset) emit('choose', preset);
  },
});
</script>

<template>
  <div v-if="presets.length" class="min-w-0" data-ai-presets>
    <FieldSelect
      v-model="value"
      :options
      :label="phrase.ai_templates_presets"
      :placeholder="phrase.ai_templates_presets"
      compact
    />
  </div>
</template>
