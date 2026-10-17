<script lang="ts" setup>
import type { AiTermItem } from '#layers/thei/shared/ai-memory';

/**
 * One word of the owner's dictionary: as they write it, what it is, its
 * other forms and how many texts use it; whether proofreading leaves it as
 * written. Changed in the dictionary's popup.
 */
defineProps<{ term: AiTermItem }>();
const emit = defineEmits<{ edit: [event: MouseEvent]; remove: [] }>();
</script>

<template>
  <div
    class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5
      gap-y-0.5 border-t border-border-1/70 px-sm py-2.5 first:border-t-0"
    :data-term="term.word"
  >
    <Icon name="case-important" class="mt-1 text-text-2" />
    <p class="min-w-0 text-sm leading-normal wrap-anywhere">
      <b class="font-semibold">{{ term.display }}</b>
      <AiPill v-if="term.keep" class="ml-1.5 align-[0.1em]">{{
        phrase.ai_memory_term_keep
      }}</AiPill>
      <template v-if="term.note"> — {{ publicText(term.note) }}</template>
    </p>
    <span class="col-start-3 row-span-2 row-start-1 flex gap-0.5 self-center">
      <Button
        variant="secondary"
        size="icon-sm"
        class="bg-transparent pointer-coarse:size-11"
        :aria-label="phrase.ai_memory_edit"
        :data-title-popup="phrase.ai_memory_edit"
        aria-haspopup="dialog"
        data-term-edit
        @click="emit('edit', $event)"
      >
        <Icon name="edit" />
      </Button>
      <Button
        variant="secondary"
        size="icon-sm"
        class="bg-transparent pointer-coarse:size-11"
        :aria-label="phrase.ai_memory_term_remove"
        :data-title-popup="phrase.ai_memory_term_remove"
        data-term-remove
        @click="emit('remove')"
      >
        <Icon name="delete" />
      </Button>
    </span>
    <p class="col-start-2 text-xs leading-snug text-text-2">
      {{ phrase.ai_memory_term_uses(term.uses)
      }}<template v-if="term.forms.length">
        · {{ term.forms.join(', ') }}</template
      >
    </p>
  </div>
</template>
