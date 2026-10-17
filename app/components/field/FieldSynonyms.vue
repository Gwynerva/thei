<script lang="ts" setup>
import {
  cleanSynonym,
  SYNONYM_LIMIT,
  SYNONYM_MAX_LENGTH,
  SYNONYM_SEPARATOR,
  synonymIdentity,
} from '#layers/thei/shared/synonyms';
import {
  isTitlePopupGap,
  readTitlePopup,
  titlePopup,
  TITLE_POPUP_GAP,
  type TitlePopupAttrs,
} from '#layers/thei/app/composables/title-popup-content';

/**
 * The other names something is known by — a tag, a project, an event, a
 * page — typed one by one or pasted as a list, each a chip. A name the
 * title already says, or one already there, is not added twice.
 *
 * `suggestions` are words offered to be added with a click, each with what
 * its hint says of it; a tag offers the words its entities keep using.
 */
const {
  title,
  hint,
  suggestions = [],
  suggestionsLabel,
} = defineProps<{
  title: string;
  /** What the hint under the field says; the general one by default. */
  hint?: string;
  suggestions?: { word: string; popup?: TitlePopupAttrs }[];
  suggestionsLabel?: string;
}>();

const synonyms = defineModel<string[]>({ required: true });
const draft = ref('');
const inputElement = useTemplateRef<HTMLInputElement>('input');
const hintId = useId();

const taken = computed(
  () =>
    new Set(
      [title, ...synonyms.value].map((name) =>
        synonymIdentity(cleanSynonym(name)),
      ),
    ),
);
const full = computed(() => synonyms.value.length >= SYNONYM_LIMIT);
const visibleSuggestions = computed(() =>
  full.value
    ? []
    : suggestions.filter(({ word }) => !taken.value.has(synonymIdentity(word))),
);

/** Adds whatever was typed, split where several words were typed at once. */
function commit(value = draft.value) {
  const next = [...synonyms.value];
  const seen = new Set(taken.value);
  for (const part of value.split(SYNONYM_SEPARATOR)) {
    const synonym = cleanSynonym(part).slice(0, SYNONYM_MAX_LENGTH);
    const identity = synonymIdentity(synonym);
    if (!identity || seen.has(identity) || next.length >= SYNONYM_LIMIT)
      continue;
    seen.add(identity);
    next.push(synonym);
  }
  if (next.length !== synonyms.value.length) synonyms.value = next;
  draft.value = '';
}

// A pasted list is taken apart as it arrives; the last piece is still typed.
watch(draft, (value) => {
  if (!SYNONYM_SEPARATOR.test(value)) return;
  const parts = value.split(SYNONYM_SEPARATOR);
  commit(parts.slice(0, -1).join(','));
  draft.value = parts.at(-1)!.trimStart();
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commit();
  } else if (
    event.key === 'Backspace' &&
    !draft.value &&
    synonyms.value.length
  ) {
    synonyms.value = synonyms.value.slice(0, -1);
  }
}

function remove(index: number) {
  synonyms.value = synonyms.value.filter((_, item) => item !== index);
  inputElement.value?.focus();
}

/**
 * A suggestion's hint: the word itself first, whole, as a chip may cut it,
 * then what its own hint says of it. With nothing to say of it, the word
 * alone, only when it is cut.
 */
function suggestionPopup(suggestion: {
  word: string;
  popup?: TitlePopupAttrs;
}) {
  const said = readTitlePopup(
    suggestion.popup?.['data-title-popup'],
    suggestion.popup?.['data-title-popup-rich'],
  );
  if (!said?.length)
    return { ...titlePopup(suggestion.word), 'data-title-popup-clipped': '' };
  return titlePopup(
    { text: suggestion.word, bold: true },
    TITLE_POPUP_GAP,
    ...said.map((line) =>
      isTitlePopupGap(line)
        ? line
        : line.spans.map((span) => ({ ...span, clamp: line.clamp })),
    ),
  );
}
</script>

<template>
  <Field>
    <FieldLabel>{{ phrase.synonyms }}</FieldLabel>
    <!-- A field as every field is: its border turns stronger under the
         pointer and in focus. -->
    <div
      class="flex min-h-12 cursor-text flex-wrap items-center gap-2
        rounded-normal border-2 border-border-1 bg-bg-1 p-sm transition
        focus-within:border-border-3 hocus:border-border-3"
      @click.self="inputElement?.focus()"
    >
      <span
        v-for="(synonym, index) in synonyms"
        :key="synonymIdentity(synonym)"
        class="inline-flex h-8 max-w-full items-center gap-1 rounded-sm border
          border-border-1 bg-bg-3 pr-1 pl-xs text-xs leading-none font-semibold"
        :data-title-popup="synonym"
        data-title-popup-clipped
      >
        <span class="min-w-0 truncate" data-title-popup-clip>{{
          synonym
        }}</span>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-sm leading-none transition
            focus-visible:ring-2 focus-visible:ring-accent
            hocus:text-text-error"
          :aria-label="phrase.synonym_remove(synonym)"
          :data-title-popup="phrase.synonym_remove(synonym)"
          @click="remove(index)"
        >
          <Icon name="close" />
        </button>
      </span>
      <input
        ref="input"
        v-model="draft"
        type="text"
        autocomplete="off"
        spellcheck="true"
        :maxlength="SYNONYM_MAX_LENGTH"
        :disabled="full"
        :placeholder="full ? '' : phrase.synonyms_placeholder"
        :aria-label="phrase.synonyms"
        :aria-describedby="hintId"
        class="field-sizing-content max-w-full min-w-28 self-stretch
          bg-transparent text-sm outline-none sm:min-w-0"
        @keydown="onKeydown"
        @blur="commit()"
      />
    </div>
    <FieldHint :id="hintId">
      {{ hint ?? phrase.synonyms_hint }}
      <template v-if="full">
        {{ phrase.synonyms_limit(SYNONYM_LIMIT) }}</template
      >
    </FieldHint>
    <div v-if="visibleSuggestions.length" class="mt-sm">
      <p class="mb-xs text-sm font-semibold text-text-3">
        {{ suggestionsLabel }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="suggestion in visibleSuggestions"
          :key="suggestion.word"
          type="button"
          class="inline-flex h-8 max-w-full cursor-pointer items-center gap-1
            rounded-sm border border-dashed border-border-3 bg-bg-2 px-xs
            text-xs leading-none font-semibold text-text-2 transition
            hocus:border-accent hocus:text-accent"
          :aria-label="phrase.synonym_suggestion_add(suggestion.word)"
          v-bind="suggestionPopup(suggestion)"
          @click="commit(suggestion.word)"
        >
          <Icon name="plus-circle" class="shrink-0" />
          <span class="min-w-0 truncate" data-title-popup-clip>{{
            suggestion.word
          }}</span>
        </button>
      </div>
    </div>
  </Field>
</template>
