<script lang="ts" setup>
import type {
  AiTemplateItem,
  AiTemplateListResponse,
} from '#layers/thei/shared/ai-template';
import { aiTemplateModal } from '#layers/thei/app/modals/ai-template/modal';

/**
 * The templates tab: requests to the AI ready to go, the built-in checks
 * first. A check runs from its row over what it has not looked at yet; a
 * request of the owner's opens a new session with its words to add to. The
 * rest is set in the template's window.
 */
const requestFetch = useRequestFetch();
const { data, refresh } = await useAsyncData('ai-templates', () =>
  requestFetch<AiTemplateListResponse>('/api/admin/ai/templates'),
);
const templates = computed(() => data.value?.templates ?? []);

// While a run answers, the list looks again now and then to see it end.
const anyRunning = computed(() =>
  templates.value.some((template) => template.lastSession?.state === 'running'),
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

/** A ready-made request opens in a new session, its words to add to. */
function open(template: AiTemplateItem) {
  void navigateTo(newSessionLocation({ template: template.templateId }));
}

const starting = ref<string>();
async function run(template: AiTemplateItem) {
  if (!template.builtin) return open(template);
  if (starting.value) return;
  starting.value = template.templateId;
  try {
    if (await runAiCheck(template)) await refresh();
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
  if (result.type === 'started') return;
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

    <div
      class="rounded-normal border border-border-1 bg-bg-1"
      data-templates-list
    >
      <AiTemplateRow
        v-for="template in templates"
        :key="template.templateId"
        :template
        :starting="starting === template.templateId"
        @run="run(template)"
        @edit="edit(template)"
      />
    </div>
  </div>
</template>
