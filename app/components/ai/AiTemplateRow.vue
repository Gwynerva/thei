<script lang="ts" setup>
import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * One template, a row of the templates' table: what it asks and, for a
 * check, what its last run left — under its words on
 * a phone — and at the right its buttons: open it in a new session, to add
 * an entity or words to; for a check, run it over what is new in the
 * archive at once; and its settings.
 */
const props = defineProps<{
  template: AiTemplateItem;
  /** Its run is being started. */
  starting?: boolean;
}>();
const emit = defineEmits<{
  open: [];
  run: [];
  edit: [];
}>();

const check = computed(() => Boolean(props.template.builtin));
</script>

<template>
  <tr class="tr-normal align-top" :data-template-row="template.templateId">
    <td class="p-td">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-sm leading-snug font-semibold">{{
          publicText(template.title)
        }}</span>
        <p class="line-clamp-2 text-xs leading-normal text-text-2">
          {{ publicText(template.instruction) }}
        </p>
        <div v-if="check" class="text-xs leading-snug sm:hidden">
          <AiTemplateLastRun :template :starting />
        </div>
      </div>
    </td>
    <td class="p-td text-xs leading-snug max-sm:hidden">
      <AiTemplateLastRun v-if="check" :template :starting />
    </td>
    <td class="p-td">
      <div class="flex justify-end gap-1">
        <Button
          variant="secondary"
          size="icon"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="phrase.ai_template_open"
          :data-title-popup="phrase.ai_template_open"
          data-template-open
          @click="emit('open')"
        >
          <Icon name="ai-chat" />
        </Button>
        <Button
          v-if="check"
          variant="secondary"
          size="icon"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="phrase.ai_template_run"
          :data-title-popup="phrase.ai_template_run"
          :disabled="starting"
          data-template-run
          @click="emit('run')"
        >
          <Icon :name="starting ? 'loading' : 'list-check'" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          class="bg-transparent pointer-coarse:size-11"
          :aria-label="phrase.ai_template_edit"
          :data-title-popup="phrase.ai_template_edit"
          data-template-edit
          @click="emit('edit')"
        >
          <Icon name="edit" />
        </Button>
      </div>
    </td>
  </tr>
</template>
