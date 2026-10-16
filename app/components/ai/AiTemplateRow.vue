<script lang="ts" setup>
import type { AiTemplateItem } from '#layers/thei/shared/ai-template';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * One template across the list: what it asks, which model answers it and,
 * for a check, what its last run left; at the right where it is offered,
 * then the button that runs a check — or opens a request in a new session —
 * and the settings. On a phone those end the row.
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
const running = computed(
  () => props.starting || props.template.lastSession?.state === 'running',
);
const offeredOn = computed(() =>
  props.template.offerOn.map((kind) => ({
    kind,
    icon: entityTypeIcon(kind),
    label: entityTypeLabel(kind),
  })),
);
const action = computed(() =>
  check.value ? phrase.value.ai_template_run : phrase.value.ai_template_open,
);
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
        class="flex min-w-0 items-baseline gap-xs text-sm leading-snug
          font-semibold"
        ><span class="min-w-0">{{ publicText(template.title) }}</span
        ><span
          v-if="template.builtin"
          class="shrink-0 text-2xs font-normal text-text-3"
          >{{ phrase.ai_template_builtin }}</span
        ></span
      >
      <p class="line-clamp-2 text-xs leading-normal text-text-2">
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
        <template v-if="check">
          <TheiLink
            v-if="running && template.lastSession"
            :to="{
              path: '/admin/ai/',
              query: { session: template.lastSession.sessionUuid },
            }"
            class="inline-flex items-center gap-1 text-text-2 underline
              decoration-text-2/35 underline-offset-2 transition
              hocus:text-accent"
          >
            <AiRunningDots />{{ phrase.ai_template_running }}
          </TheiLink>
          <TheiLink
            v-else-if="template.lastSession"
            :to="{
              path: '/admin/ai/',
              query: { session: template.lastSession.sessionUuid },
            }"
            class="inline-flex items-center gap-1 text-text-2 underline
              decoration-text-2/35 underline-offset-2 transition
              hocus:text-accent"
            data-template-last
          >
            <Icon name="ai-chat" class="shrink-0 text-text-3" />{{
              shortWhen(template.lastSession.startedAt)
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
              phrase.ai_template_never_run
            }}
          </span>
        </template>
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-0.5 text-xs">
      <b class="truncate font-semibold">{{ phrase.ai_template_offer_on }}</b>
      <span
        v-if="offeredOn.length"
        class="flex flex-wrap items-center gap-1.5 text-text-2"
        :data-title-popup="offeredOn.map((item) => item.label).join(', ')"
        data-template-offered
      >
        <Icon
          v-for="item in offeredOn"
          :key="item.kind"
          :name="item.icon"
          :aria-label="item.label"
          role="img"
        />
      </span>
      <span v-else class="truncate text-text-2">{{
        phrase.ai_template_offered_nowhere(check)
      }}</span>
    </div>

    <div class="flex gap-1">
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
        <Icon :name="starting ? 'loading' : check ? 'list-check' : 'ai-chat'" />
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
