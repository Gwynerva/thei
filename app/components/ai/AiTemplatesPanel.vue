<script lang="ts" setup>
import {
  isPresetTemplate,
  type AiTemplateItem,
  type AiTemplateListResponse,
} from '#layers/thei/shared/ai-template';
import { aiTemplateModal } from '#layers/thei/app/modals/ai-template/modal';

/**
 * The templates tab: requests to the AI ready to go, in two groups. The
 * ready-made ones, without a schedule, the owner opens in a new session with
 * their words to add to; the scheduled ones start by themselves, switched on
 * the row. The rest is set in the template's window.
 */
const requestFetch = useRequestFetch();
const { data, refresh } = await useAsyncData('ai-templates', () =>
  requestFetch<AiTemplateListResponse>('/api/admin/ai/templates'),
);

const presets = computed(
  () => data.value?.templates.filter(isPresetTemplate) ?? [],
);
const scheduled = computed(
  () =>
    data.value?.templates.filter((template) => !isPresetTemplate(template)) ??
    [],
);

// While a run answers, the list looks again now and then to see it end.
const anyRunning = computed(() =>
  data.value?.templates.some(
    (template) => template.lastSession?.state === 'running',
  ),
);
let timer: ReturnType<typeof setTimeout> | undefined;
// Each reading of the list sets the next while a run still answers.
watch(
  data,
  () => {
    clearTimeout(timer);
    if (anyRunning.value && import.meta.client)
      timer = setTimeout(() => void refresh(), 4000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

/**
 * A schedule switched on or off. Its time is the one the owner sees, so it
 * is kept in their time zone — a built-in one comes set in UTC.
 */
async function toggle(template: AiTemplateItem, enabled: boolean) {
  const schedule = template.schedule;
  try {
    await $fetch(`/api/admin/ai/templates/${template.templateId}`, {
      method: 'PATCH',
      body: {
        enabled,
        ...(schedule.kind === 'manual'
          ? {}
          : {
              schedule: {
                ...schedule,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            }),
      },
    });
    await refresh();
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
}

function startedToast(title: string, sessionUuid: string) {
  showToast(phrase.value.ai_template_started(publicText(title)), {
    label: phrase.value.ai_action_open,
    run: () => {
      void navigateTo({ path: '/admin/ai/', query: { session: sessionUuid } });
    },
  });
}

/** A ready-made request opens in a new session, its words to add to. */
function open(template: AiTemplateItem) {
  void navigateTo(newSessionLocation({ template: template.templateId }));
}

const starting = ref<string>();
async function run(template: AiTemplateItem) {
  if (isPresetTemplate(template)) return open(template);
  if (starting.value) return;
  starting.value = template.templateId;
  try {
    const { sessionUuid } = await $fetch<{ sessionUuid: string }>(
      `/api/admin/ai/templates/${template.templateId}/run`,
      {
        method: 'POST',
        body: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      },
    );
    await refresh();
    startedToast(template.title, sessionUuid);
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    starting.value = undefined;
  }
}

async function edit(template?: AiTemplateItem) {
  const result = await openModal(aiTemplateModal, {
    templateId: template?.templateId,
  });
  if (
    result.type === 'empty' ||
    result.type === 'error' ||
    result.type === 'opened'
  )
    return;
  await refresh();
  if (result.type === 'started') startedToast(result.title, result.sessionUuid);
  else
    showToast(
      result.type === 'deleted'
        ? phrase.value.ai_template_deleted
        : result.type === 'copied'
          ? phrase.value.ai_template_copied
          : phrase.value.ai_template_saved,
    );
}

const groups = computed(() => [
  {
    key: 'presets',
    title: phrase.value.ai_templates_presets,
    hint: phrase.value.ai_templates_presets_hint,
    empty: phrase.value.ai_templates_presets_empty,
    templates: presets.value,
  },
  {
    key: 'scheduled',
    title: phrase.value.ai_templates_scheduled,
    hint: phrase.value.ai_templates_scheduled_hint,
    empty: '',
    templates: scheduled.value,
  },
]);
</script>

<template>
  <div class="flex flex-col gap-sm" data-templates-panel>
    <div class="flex items-center gap-sm">
      <h2 class="min-w-0 flex-1 text-lg font-bold">
        {{ phrase.ai_templates_title }}
      </h2>
      <Button
        class="flex h-9 items-center gap-xs pointer-coarse:h-11"
        data-template-new
        @click="edit()"
      >
        <Icon name="plus" />{{ phrase.ai_templates_new }}
      </Button>
    </div>
    <p class="text-sm text-text-2">{{ phrase.ai_templates_hint }}</p>

    <section
      v-for="group in groups"
      :key="group.key"
      class="flex flex-col gap-xs"
      :data-templates-group="group.key"
    >
      <h3 class="mt-xs text-2xs font-bold tracking-wider text-text-3 uppercase">
        {{ group.title }}
      </h3>
      <p class="text-xs text-text-3">{{ group.hint }}</p>
      <div class="rounded-normal border border-border-1 bg-bg-1">
        <AiTemplateRow
          v-for="template in group.templates"
          :key="template.templateId"
          :template
          :starting="starting === template.templateId"
          @toggle="toggle(template, $event)"
          @run="run(template)"
          @edit="edit(template)"
        />
        <p
          v-if="!group.templates.length && group.empty"
          class="px-md py-sm text-sm text-text-3"
        >
          {{ group.empty }}
        </p>
      </div>
    </section>
  </div>
</template>
