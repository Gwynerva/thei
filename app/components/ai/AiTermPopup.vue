<script lang="ts" setup>
import { AI_TERM_DISPLAY_MAX, AI_TERM_NOTE_MAX } from '#layers/thei/shared/ai';
import type { AiTermItem } from '#layers/thei/shared/ai-memory';
import { termKey } from '#layers/thei/shared/text-terms';

/**
 * A word of the dictionary, added or changed in one go: as the owner writes
 * it, what it is, its other forms, and whether proofreading leaves it as
 * written. It opens from the section's «+» for a new word, and from a
 * word's own row to change it, spelling included.
 */
const props = defineProps<{
  anchor: HTMLElement | null;
  /** The word being changed; none for a new one. */
  term?: AiTermItem;
  /** Every word there is, so a spelling taken already is said at once. */
  terms: AiTermItem[];
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ saved: [term: AiTermItem, previous?: string] }>();

const draft = ref({ display: '', note: '', forms: '', keep: true });
const busy = ref(false);
const error = ref('');

watch(open, (opened) => {
  if (!opened) return;
  const term = props.term;
  draft.value = term
    ? {
        display: term.display,
        note: term.note,
        forms: term.forms.join(', '),
        keep: term.keep,
      }
    : { display: '', note: '', forms: '', keep: true };
  error.value = '';
});

const forms = computed(() =>
  draft.value.forms
    .split(',')
    .map((form) => form.trim())
    .filter(Boolean),
);

/** Another word already written so, or with this among its forms. */
const taken = computed(() => {
  // Keyed as the server keys them (`termKey`), or a word it refuses passes.
  const words = [draft.value.display, ...forms.value]
    .map(termKey)
    .filter(Boolean);
  return props.terms.some(
    (term) =>
      term.word !== props.term?.word &&
      [term.display, ...term.forms].some((word) =>
        words.includes(termKey(word)),
      ),
  );
});

const canSave = computed(
  () => !busy.value && draft.value.display.trim() !== '' && !taken.value,
);

async function save() {
  if (!canSave.value) return;
  busy.value = true;
  error.value = '';
  const body = {
    display: draft.value.display,
    note: draft.value.note,
    forms: forms.value,
    keep: draft.value.keep,
  };
  try {
    const previous = props.term?.word;
    const term = previous
      ? await $fetch<AiTermItem>(
          `/api/admin/ai/terms/${encodeURIComponent(previous)}`,
          { method: 'PATCH', body },
        )
      : await $fetch<AiTermItem>('/api/admin/ai/terms', {
          method: 'POST',
          body,
        });
    emit('saved', term, previous);
    open.value = false;
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor
    placement="bottom-end"
    max-width="22rem"
    density="card"
    complex
  >
    <form class="flex flex-col gap-sm" data-term-popup @submit.prevent="save">
      <Field>
        <FieldLabel class="text-sm" required>{{
          phrase.ai_memory_term_word
        }}</FieldLabel>
        <FieldInput
          v-model="draft.display"
          required
          :maxlength="AI_TERM_DISPLAY_MAX"
          :placeholder="phrase.ai_memory_term_new"
          class="text-sm"
          data-term-word
        />
      </Field>
      <Field>
        <FieldLabel class="text-sm">{{
          phrase.ai_memory_term_note
        }}</FieldLabel>
        <FieldInput
          v-model="draft.note"
          :maxlength="AI_TERM_NOTE_MAX"
          :placeholder="phrase.ai_memory_term_note_placeholder"
          class="text-sm"
          data-term-note
        />
      </Field>
      <Field>
        <FieldLabel class="text-sm">{{
          phrase.ai_memory_term_forms
        }}</FieldLabel>
        <FieldInput
          v-model="draft.forms"
          :placeholder="phrase.ai_memory_term_forms_placeholder"
          class="text-sm"
          data-term-forms
        />
      </Field>
      <FieldToggle
        v-model="draft.keep"
        :switch-label="phrase.ai_memory_term_keep"
        class="text-sm"
        data-term-keep
      >
        <div
          class="flex cursor-pointer flex-col text-text-2"
          @click="draft.keep = !draft.keep"
        >
          <span class="font-semibold text-text-1">{{
            phrase.ai_memory_term_keep
          }}</span>
          <span class="text-xs">{{ phrase.ai_memory_term_keep_hint }}</span>
        </div>
      </FieldToggle>

      <p
        v-if="taken || error"
        role="status"
        class="text-sm text-text-error"
        data-term-taken
      >
        {{ taken ? phrase.ai_memory_term_exists : error }}
      </p>

      <Button
        type="submit"
        class="flex items-center justify-center gap-xs"
        :disabled="!canSave"
        data-term-save
      >
        <Icon v-if="busy" name="loading" />{{
          term ? phrase.save : phrase.ai_memory_term_add
        }}
      </Button>
    </form>
  </FloatingPopup>
</template>
