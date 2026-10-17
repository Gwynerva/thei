<script lang="ts" setup>
import type {
  AiTemplateItem,
  AiTemplateListResponse,
} from '#layers/thei/shared/ai-template';
import { aiTemplateModal } from '#layers/thei/app/modals/ai-template/modal';

/**
 * The templates tab: requests to the AI ready to go, as a table in two
 * sections — the built-in checks, then the owner's own. A check runs from
 * its row over what is new in the archive; a request of the owner's opens a
 * new session with its words to add to. The rest is set in the template's
 * window.
 */
const requestFetch = useRequestFetch();
const { data, refresh } = await useAsyncData('ai-templates', () =>
  requestFetch<AiTemplateListResponse>('/api/admin/ai/templates'),
);
const templates = computed(() => data.value?.templates ?? []);

/** The built-in templates, then the owner's own, each a section. */
const groups = computed(() => [
  {
    key: 'builtin',
    title: phrase.value.ai_templates_builtin_section,
    templates: templates.value.filter((template) => template.builtin),
  },
  {
    key: 'own',
    title: phrase.value.ai_templates_own_section,
    templates: templates.value.filter((template) => !template.builtin),
  },
]);

// While a run answers, the list looks again now and then to see it end.
const anyRunning = computed(() =>
  templates.value.some((template) => template.lastSession?.state === 'running'),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let gone = false;
/** Each reading of the list sets the next while a run still answers. */
function later() {
  clearTimeout(timer);
  if (anyRunning.value && import.meta.client && !gone)
    timer = setTimeout(look, 4000);
}
/** A look that fails leaves the list as it is, and looks again in a while. */
async function look() {
  try {
    data.value = await $fetch<AiTemplateListResponse>(
      '/api/admin/ai/templates',
    );
  } catch {
    later();
  }
}
watch(data, later, { immediate: true });
onBeforeUnmount(() => {
  gone = true;
  clearTimeout(timer);
});

/** A ready-made request opens in a new session, its words to add to. */
function open(template: AiTemplateItem) {
  void navigateTo(newSessionLocation({ template: template.templateId }));
}

const starting = ref<string>();
async function run(template: AiTemplateItem) {
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

    <Box data-templates-list>
      <div class="overflow-auto">
        <table class="w-full">
          <thead>
            <tr class="th">
              <th
                scope="col"
                class="w-full rounded-tl-normal p-td-tight text-left"
              >
                {{ phrase.ai_templates_column_template }}
              </th>
              <th
                scope="col"
                class="min-w-44 p-td-tight text-left max-sm:hidden"
              >
                {{ phrase.ai_templates_column_last }}
              </th>
              <th scope="col" class="rounded-tr-normal"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.key">
              <tr class="tr-section" :data-templates-group="group.key">
                <td colspan="3" class="p-td-tight text-sm text-text-2">
                  {{ group.title }}
                </td>
              </tr>
              <AiTemplateRow
                v-for="template in group.templates"
                :key="template.templateId"
                :template
                :starting="starting === template.templateId"
                @run="run(template)"
                @open="open(template)"
                @edit="edit(template)"
              />
              <tr v-if="!group.templates.length">
                <td colspan="3" class="p-td text-sm text-text-3">
                  {{ phrase.ai_templates_own_empty }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </Box>
  </div>
</template>
