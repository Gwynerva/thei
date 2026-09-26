<script lang="ts" setup>
import {
  cleanTagTitle,
  normalizeTagTitle,
  TAG_SYNONYM_LIMIT,
  TAG_SYNONYM_SEPARATOR,
  TAG_TITLE_MAX_LENGTH,
} from '#layers/thei/shared/tag';
import type { TagSynonymSuggestion } from '#layers/thei/shared/tag-recommendation';
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

/**
 * The other words a tag is known by, typed one by one or pasted as a list,
 * and the words its own entities keep using, offered to be added with a
 * click. Suggestions come from the saved tag, so they are asked for again
 * whenever `revision` changes after a save.
 */
const {
  tagUuid,
  title,
  revision = 0,
} = defineProps<{
  /** Absent while the tag is being created: there is nothing to learn from. */
  tagUuid?: string;
  title: string;
  revision?: number;
}>();

const synonyms = defineModel<string[]>({ required: true });
const draft = ref('');
const inputElement = useTemplateRef<HTMLInputElement>('input');
const suggestions = ref<TagSynonymSuggestion[]>([]);
const hintId = useId();

const taken = computed(
  () =>
    new Set(
      [title, ...synonyms.value].map((name) =>
        normalizeTagTitle(cleanTagTitle(name)),
      ),
    ),
);
const full = computed(() => synonyms.value.length >= TAG_SYNONYM_LIMIT);
const visibleSuggestions = computed(() =>
  full.value
    ? []
    : suggestions.value.filter(
        ({ word }) => !taken.value.has(normalizeTagTitle(word)),
      ),
);

/** Adds whatever was typed, split where several words were typed at once. */
function commit(value = draft.value) {
  const next = [...synonyms.value];
  const seen = new Set(taken.value);
  for (const part of value.split(TAG_SYNONYM_SEPARATOR)) {
    const synonym = cleanTagTitle(part).slice(0, TAG_TITLE_MAX_LENGTH);
    const identity = normalizeTagTitle(synonym);
    if (!identity || seen.has(identity) || next.length >= TAG_SYNONYM_LIMIT)
      continue;
    seen.add(identity);
    next.push(synonym);
  }
  if (next.length !== synonyms.value.length) synonyms.value = next;
  draft.value = '';
}

// A pasted list is taken apart as it arrives; the last piece is still typed.
watch(draft, (value) => {
  if (!TAG_SYNONYM_SEPARATOR.test(value)) return;
  const parts = value.split(TAG_SYNONYM_SEPARATOR);
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

async function loadSuggestions() {
  if (!tagUuid) return;
  try {
    suggestions.value = await $fetch<TagSynonymSuggestion[]>(
      `/api/admin/tags/${tagUuid}/synonyms`,
    );
  } catch {
    // Suggestions are a convenience; the field works without them.
    suggestions.value = [];
  }
}

onMounted(() => {
  void loadSuggestions();
  watch(
    () => revision,
    () => void loadSuggestions(),
  );
});
</script>

<template>
  <Field>
    <FieldLabel>{{ phrase.tag_synonyms }}</FieldLabel>
    <div
      class="flex min-h-12 cursor-text flex-wrap items-center gap-2
        rounded-normal border-2 border-dashed border-border-2 bg-bg-1/50 p-sm
        transition focus-within:border-accent hover:border-border-3
        focus-within:hover:border-accent"
      @click.self="inputElement?.focus()"
    >
      <span
        v-for="(synonym, index) in synonyms"
        :key="normalizeTagTitle(synonym)"
        class="inline-flex h-8 max-w-full items-center gap-1 rounded-sm border
          border-border-1 bg-bg-3 pr-1 pl-xs text-xs leading-none font-semibold"
      >
        <span class="min-w-0 truncate">{{ synonym }}</span>
        <button
          type="button"
          class="shrink-0 cursor-pointer leading-none transition
            hocus:text-text-error"
          :aria-label="phrase.tag_synonym_remove(synonym)"
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
        :maxlength="TAG_TITLE_MAX_LENGTH"
        :disabled="full"
        :placeholder="full ? '' : phrase.tag_synonyms_placeholder"
        :aria-label="phrase.tag_synonyms"
        :aria-describedby="hintId"
        class="field-sizing-content max-w-full min-w-28 self-stretch
          bg-transparent text-sm outline-none sm:min-w-0"
        @keydown="onKeydown"
        @blur="commit()"
      />
    </div>
    <FieldHint :id="hintId">
      {{ phrase.tag_synonyms_hint }}
      <template v-if="full">
        {{ phrase.tag_synonyms_limit(TAG_SYNONYM_LIMIT) }}</template
      >
    </FieldHint>
    <div v-if="visibleSuggestions.length" class="mt-sm">
      <p class="mb-xs text-sm font-semibold text-text-3">
        {{ phrase.tag_synonym_suggestions }}
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
          :aria-label="phrase.tag_synonym_suggestion_add(suggestion.word)"
          v-bind="
            titlePopup([
              { text: `${phrase.tag_synonym_found_in}: `, bold: true },
              {
                text: suggestion.entities
                  .map((entity) => entity.title)
                  .join(', '),
                clamp: true,
              },
            ])
          "
          @click="commit(suggestion.word)"
        >
          <Icon name="plus-circle" class="shrink-0" />
          <span class="min-w-0 truncate">{{ suggestion.word }}</span>
        </button>
      </div>
    </div>
  </Field>
</template>
