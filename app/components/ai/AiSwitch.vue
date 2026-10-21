<script lang="ts" setup>
/**
 * The switch for all of AI, with what it means either way: on the AI page's
 * connection tab, and in the site's settings — where a person looks for it
 * once AI is off and its ✦ is gone. Applied at once; a failed switch stays
 * as the server has it.
 */
const aiEnabled = useAiEnabled();
const busy = ref(false);
const error = ref('');

async function setEnabled(value: boolean) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await $fetch<{ enabled: boolean }>(
      '/api/admin/ai/settings',
      { method: 'PUT', body: { enabled: value } },
    );
    setAiEnabled(result.enabled);
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Box class="flex flex-col gap-xs p-sm sm:p-md" data-ai-switch>
    <FieldToggle
      :model-value="aiEnabled"
      :label="phrase.ai_switch"
      :switch-label="phrase.ai_switch"
      :disabled="busy"
      @update:model-value="setEnabled(Boolean($event))"
    />
    <p class="text-sm text-text-2">
      {{ aiEnabled ? phrase.ai_access_on_hint : phrase.ai_access_off_hint }}
    </p>
    <p v-if="error" class="text-sm text-text-error">
      <Icon name="warning" class="mr-xs" />{{ error }}
    </p>
  </Box>
</template>
