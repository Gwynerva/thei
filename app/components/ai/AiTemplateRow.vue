<script lang="ts" setup>
import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * One template, a row of the templates' table: what it asks, which model
 * answers it and, for a check, what its last run left — under its words on
 * a phone — and at the right the button that runs a check, or opens a
 * request in a new session, and the settings.
 */
const props = defineProps<{
  template: AiTemplateItem;
  /** Its run is being started. */
  starting?: boolean;
}>();
const emit = defineEmits<{
  run: [];
  edit: [];
}>();

const check = computed(() => Boolean(props.template.builtin));
const action = computed(() =>
  check.value ? phrase.value.ai_template_run : phrase.value.ai_template_open,
);
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
    <td class="p-td text-xs leading-snug text-text-2 max-sm:hidden">
      <span class="inline-flex min-w-0 items-center gap-1">
        <Icon name="sparkles" class="shrink-0 text-text-3" />{{
          template.model || phrase.ai_template_default_model
        }}
      </span>
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
          :aria-label="action"
          :data-title-popup="action"
          :disabled="starting"
          data-template-run
          @click="emit('run')"
        >
          <Icon
            :name="starting ? 'loading' : check ? 'list-check' : 'ai-chat'"
          />
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
