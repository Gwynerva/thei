<script lang="ts" setup>
import type { AiTemplateItem } from '#layers/thei/shared/ai-template';

/**
 * One template across the list: what it asks, which model answers it and
 * what its last run left — and, at the right, its schedule with the switch,
 * a run now and the settings. On a phone those end the row.
 */
const props = defineProps<{
  template: AiTemplateItem;
  /** Its run is being started. */
  starting?: boolean;
}>();
const emit = defineEmits<{
  toggle: [enabled: boolean];
  run: [];
  edit: [];
}>();

const manual = computed(() => props.template.schedule.kind === 'manual');
/** A schedule switched off: the row is quieter. */
const off = computed(() => !manual.value && !props.template.enabled);
const running = computed(
  () => props.starting || props.template.lastSession?.state === 'running',
);
const next = computed(() => {
  if (manual.value) return phrase.value.ai_template_manual_line;
  if (!props.template.enabled) return phrase.value.ai_template_schedule_off;
  return props.template.nextRunAt
    ? phrase.value.ai_template_next(aheadWhen(props.template.nextRunAt))
    : '';
});
</script>

<template>
  <div
    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-sm gap-y-1.5
      border-t border-border-1/70 px-sm pt-3 pb-2 first:border-t-0
      sm:grid-cols-[minmax(0,1fr)_12.5rem_auto] sm:py-3 sm:pl-md"
    :data-template-row="template.templateId"
  >
    <div class="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
      <span
        class="text-sm leading-snug font-semibold"
        :class="{ 'opacity-60': off }"
        >{{ publicText(template.title) }}</span
      >
      <p
        class="line-clamp-2 text-xs leading-normal text-text-2"
        :class="{ 'opacity-60': off }"
      >
        {{ publicText(template.instruction) }}
      </p>
      <div
        class="flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs leading-snug
          text-text-2"
      >
        <span class="inline-flex min-w-0 items-center gap-1">
          <Icon name="sparkles" class="shrink-0 text-text-3" />{{
            template.model || phrase.ai_template_default_model
          }}
        </span>
        <TheiLink
          v-if="running && template.lastSession"
          :to="{
            path: '/admin/ai/',
            query: { session: template.lastSession.sessionUuid },
          }"
          class="inline-flex items-center gap-1 text-text-2 underline
            decoration-text-2/35 underline-offset-2 hocus:text-accent"
        >
          <AiRunningDots />{{ phrase.ai_template_running }}
        </TheiLink>
        <TheiLink
          v-else-if="template.lastSession && template.lastRunAt"
          :to="{
            path: '/admin/ai/',
            query: { session: template.lastSession.sessionUuid },
          }"
          class="inline-flex items-center gap-1 text-text-2 underline
            decoration-text-2/35 underline-offset-2 hocus:text-accent"
          data-template-last
        >
          <Icon name="ai-chat" class="shrink-0 text-text-3" />{{
            shortWhen(template.lastRunAt)
          }}
          <template v-if="template.lastSession.waiting">
            ·
            <b class="font-semibold text-accent">{{
              phrase.ai_session_waiting(template.lastSession.waiting)
            }}</b>
          </template>
        </TheiLink>
        <span v-else class="inline-flex items-center gap-1">
          <Icon name="ai-chat" class="shrink-0 text-text-3" />{{
            template.lastRunAt
              ? shortWhen(template.lastRunAt)
              : phrase.ai_template_never_run
          }}
        </span>
      </div>
    </div>

    <div class="flex min-w-0 items-center gap-2">
      <FieldToggle
        v-if="!manual"
        :model-value="template.enabled"
        :switch-label="phrase.ai_template_schedule"
        data-template-switch
        @update:model-value="emit('toggle', Boolean($event))"
      />
      <span class="flex min-w-0 flex-col text-xs leading-tight">
        <b
          class="truncate font-semibold"
          :class="{ 'font-medium text-text-2': off }"
          >{{ scheduleLine(template.schedule) }}</b
        >
        <span class="truncate text-xs text-text-2">{{ next }}</span>
      </span>
    </div>

    <div class="flex gap-1">
      <Button
        variant="secondary"
        size="icon"
        class="bg-transparent pointer-coarse:size-11"
        :aria-label="phrase.ai_template_run"
        :data-title-popup="phrase.ai_template_run"
        :disabled="running"
        data-template-run
        @click="emit('run')"
      >
        <Icon :name="starting ? 'loading' : 'play-circle'" />
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
  </div>
</template>
