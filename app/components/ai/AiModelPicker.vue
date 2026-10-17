<script lang="ts" setup>
import {
  aiModelName,
  type AiModelsResponse,
} from '#layers/thei/shared/ai-model';
import type { SelectOption } from '#layers/thei/app/components/field/FieldSelect.vue';

/**
 * Which model answers a session: the connection's own, or another its
 * service lists. The list is asked for the first time the owner reaches for
 * it, not on every page: asking sends the API key. A name chosen before and
 * no longer listed stays among the options.
 */
const model = defineModel<string>({ default: '' });
defineProps<{ disabled?: boolean }>();

const { data: connection } = useAiModel();
const connectionModel = computed(() =>
  connection.value ? aiModelName(connection.value) : '',
);

const listed = ref<string[]>([]);
let asked = false;
function wanted() {
  if (asked) return;
  asked = true;
  void $fetch<AiModelsResponse>('/api/admin/ai/model/models', {
    method: 'POST',
    body: {},
  })
    .then((answer) => (listed.value = answer.models))
    .catch(() => {});
}

const options = computed<SelectOption[]>(() => {
  const others = [
    ...new Set([...(model.value ? [model.value] : []), ...listed.value]),
  ].filter((name) => name !== connectionModel.value);
  return [
    {
      value: '',
      label: connectionModel.value || phrase.value.ai_model_choice,
      divider: others.length > 0,
    },
    ...others.map((name) => ({ value: name, label: name })),
  ];
});
</script>

<template>
  <div
    class="min-w-0"
    data-model-picker
    @focusin="wanted"
    @pointerdown="wanted"
  >
    <FieldSelect
      v-model="model"
      :options
      :label="phrase.ai_model_choice"
      :disabled
      compact
    />
  </div>
</template>
