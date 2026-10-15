<script lang="ts" setup>
import { AI_MEMORY_TEXT_MAX } from '#layers/thei/shared/ai-memory';

/**
 * Something for the AI to remember about the entity a form edits, written
 * by the owner: a sentence or two, read only when a model works with it.
 * It opens from the ✦ menu and from the memory block's «+».
 */
const props = defineProps<{ anchor: HTMLElement | null }>();
const open = defineModel<boolean>('open', { required: true });

const ai = useEntityAi();
const text = ref('');
const busy = ref(false);
const error = ref('');

watch(open, (opened) => {
  if (!opened) return;
  text.value = '';
  error.value = '';
});

async function save() {
  const words = text.value.trim();
  if (!ai || busy.value || !words) return;
  busy.value = true;
  error.value = '';
  try {
    await ai.remember(words);
    open.value = false;
    showToast(phrase.value.ai_remember_saved);
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    busy.value = false;
  }
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void save();
  }
}
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="props.anchor"
    placement="bottom-end"
    max-width="22rem"
  >
    <form
      class="flex flex-col gap-sm rounded-normal border border-border-1 bg-bg-2
        p-sm"
      data-remember-popup
      @submit.prevent="save"
    >
      <Field>
        <FieldLabel class="text-sm">{{ phrase.ai_remember_title }}</FieldLabel>
        <FieldTextarea
          v-model="text"
          rows="3"
          :maxlength="AI_MEMORY_TEXT_MAX"
          :placeholder="phrase.ai_remember_placeholder"
          class="text-sm"
          autofocus
          data-remember-text
          @keydown="keydown"
        />
        <FieldHint>{{ phrase.ai_remember_hint }}</FieldHint>
      </Field>
      <p v-if="error" role="status" class="text-sm text-text-error">
        {{ error }}
      </p>
      <Button
        type="submit"
        class="flex items-center justify-center gap-xs"
        :disabled="busy || !text.trim()"
        data-remember-save
      >
        <Icon v-if="busy" name="loading" />{{ phrase.ai_remember_save }}
      </Button>
    </form>
  </FloatingPopup>
</template>
