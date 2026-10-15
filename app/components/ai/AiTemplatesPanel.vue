<script lang="ts" setup>
import type {
  AiTemplateItem,
  AiTemplateListResponse,
} from '#layers/thei/shared/ai-template';
import { aiTemplateModal } from '#layers/thei/app/modals/ai-template/modal';

/**
 * The templates tab: requests to the AI ready to go, the built-in ones and
 * the owner's own, one per row across the page. A schedule is switched on
 * the row, a run started from it; the rest is set in the template's window.
 */
const requestFetch = useRequestFetch();
const { data, refresh } = await useAsyncData('ai-templates', () =>
  requestFetch<AiTemplateListResponse>('/api/admin/ai/templates'),
);

const builtins = computed(
  () => data.value?.templates.filter((template) => template.builtin) ?? [],
);
const own = computed(
  () => data.value?.templates.filter((template) => !template.builtin) ?? [],
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

const starting = ref<string>();
async function run(template: AiTemplateItem) {
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
    showToast(phrase.value.ai_template_started(publicText(template.title)), {
      label: phrase.value.ai_action_open,
      run: () => {
        void navigateTo({
          path: '/admin/ai/',
          query: { session: sessionUuid },
        });
      },
    });
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
  if (result.type === 'empty' || result.type === 'error') return;
  await refresh();
  if (result.type === 'started')
    showToast(phrase.value.ai_template_started(publicText(result.title)), {
      label: phrase.value.ai_action_open,
      run: () => {
        void navigateTo({
          path: '/admin/ai/',
          query: { session: result.sessionUuid },
        });
      },
    });
  else
    showToast(
      result.type === 'deleted'
        ? phrase.value.ai_template_deleted
        : result.type === 'copied'
          ? phrase.value.ai_template_copied
          : phrase.value.ai_template_saved,
    );
}
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

    <h3
      class="mt-xs text-2xs font-bold tracking-wider text-text-3
        uppercase"
    >
      {{ phrase.ai_templates_builtin }}
    </h3>
    <div
      class="rounded-normal border border-border-1 bg-bg-1"
      data-templates-builtin
    >
      <AiTemplateRow
        v-for="template in builtins"
        :key="template.templateId"
        :template
        :starting="starting === template.templateId"
        @toggle="toggle(template, $event)"
        @run="run(template)"
        @edit="edit(template)"
      />
    </div>

    <h3
      class="mt-xs text-2xs font-bold tracking-wider text-text-3
        uppercase"
    >
      {{ phrase.ai_templates_own }}
    </h3>
    <div
      class="rounded-normal border border-border-1 bg-bg-1"
      data-templates-own
    >
      <AiTemplateRow
        v-for="template in own"
        :key="template.templateId"
        :template
        :starting="starting === template.templateId"
        @toggle="toggle(template, $event)"
        @run="run(template)"
        @edit="edit(template)"
      />
      <p v-if="!own.length" class="px-md py-sm text-sm text-text-3">
        {{ phrase.ai_templates_own_empty }}
      </p>
    </div>
  </div>
</template>
