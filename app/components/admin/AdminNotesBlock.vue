<script lang="ts" setup>
import type { ContentFieldModelValue } from '#layers/thei/shared/content';
import { ENTITY_REMINDER_MAX_LENGTH } from '#layers/thei/shared/entity-notes';

/**
 * The private half of an entity: a short reminder and longer notes.
 *
 * It sits at the very bottom of every edit form on purpose — it is the part
 * nobody else will ever read, so it comes after everything that will be.
 */
const reminder = defineModel<string>('reminder', { required: true });
const notes = defineModel<ContentFieldModelValue | null>('notes', {
  required: true,
});

const emit = defineEmits<{ notesSaved: [] }>();
</script>

<template>
  <div>
    <SectionHeader
      icon="text"
      :title="phrase.entity_notes_section"
      :description="phrase.entity_notes_section_description"
      class="mb-md"
    />
    <Box class="flex flex-col gap-md p-sm sm:p-md">
      <Field>
        <FieldLabel>{{ phrase.entity_reminder }}</FieldLabel>
        <FieldTextarea
          v-model="reminder"
          :maxlength="ENTITY_REMINDER_MAX_LENGTH"
          :placeholder="phrase.entity_reminder_placeholder"
          spellcheck="true"
        />
        <FieldHint>{{ phrase.entity_reminder_hint }}</FieldHint>
      </Field>

      <Field>
        <FieldLabel>{{ phrase.entity_notes }}</FieldLabel>
        <FieldContentEditor
          v-model="notes"
          :title-label="phrase.entity_notes"
          @saved="emit('notesSaved')"
        />
        <FieldHint>{{ phrase.entity_notes_hint }}</FieldHint>
      </Field>
    </Box>
  </div>
</template>
