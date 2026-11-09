<script lang="ts" setup>
import type { RelationEndpoint } from '#layers/thei/shared/relation';
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';

/**
 * What becomes of the excerpts about an entity when it is deleted, asked
 * in its deletion pane: they stay, about nothing until the owner says what
 * they are about now — the default, since they are someone else's words
 * — or they go with it. Nothing is asked of an entity nothing is about.
 */
const { target } = defineProps<{ target: RelationEndpoint }>();
const model = defineModel<'keep' | 'delete'>({ required: true });

const about = useExcerptsAbout(() => target);
const count = computed(() => about.items.value.length);
const choice = computed({
  get: () => model.value as string,
  set: (value: string | undefined) => {
    model.value = value === 'delete' ? 'delete' : 'keep';
  },
});
const options = computed<FieldOptions>(() => ({
  keep: { icon: 'excerpt', title: phrase.value.excerpts_on_delete_keep },
  delete: { icon: 'delete', title: phrase.value.excerpts_on_delete_delete },
}));
</script>

<template>
  <Field v-if="count" data-excerpts-on-delete>
    <FieldLabel>{{ phrase.excerpts }}</FieldLabel>
    <FieldOptions v-model="choice" direction="column" :options />
    <FieldHint>{{ phrase.excerpts_on_delete_count(count) }}</FieldHint>
  </Field>
</template>
