<script lang="ts" setup>
import type { TagSynonymSuggestion } from '#layers/thei/shared/tag-recommendation';
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

/**
 * A tag's synonyms, with the words its own entities keep using offered to be
 * added with a click. Suggestions come from the saved tag, so they are asked
 * for again whenever `revision` changes after a save.
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
const suggestions = ref<TagSynonymSuggestion[]>([]);

const offered = computed(() =>
  suggestions.value.map((suggestion) => ({
    word: suggestion.word,
    popup: titlePopup([
      { text: `${phrase.value.tag_synonym_found_in}: `, bold: true },
      {
        text: suggestion.entities
          .map((entity) => publicText(entity.title))
          .join(', '),
        clamp: true,
      },
    ]),
  })),
);

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
  <FieldSynonyms
    v-model="synonyms"
    :title
    :hint="phrase.tag_synonyms_hint"
    :suggestions="offered"
    :suggestions-label="phrase.tag_synonym_suggestions"
  />
</template>
