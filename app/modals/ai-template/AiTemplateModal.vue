<script setup lang="ts">
import {
  AI_TEMPLATE_INSTRUCTION_MAX,
  AI_TEMPLATE_TITLE_MAX,
  type AiTemplateDetail,
} from '#layers/thei/shared/ai-template';
import ModalContainer from '../ModalContainer.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';
import ModalTitle from '../ModalTitle.vue';
import ModalWaiting from '../ModalWaiting.vue';

/**
 * One template: its request in the owner's words, with the sessions it
 * started — opened in a new session from here, or, for a built-in check,
 * run over what is new in the archive. A built-in check's words are the
 * code's: a copy makes them a request of the owner's own. A new one starts
 * here too. The model is chosen for each session, not here.
 */
const { modalData } = defineProps<{
  modalData: { templateId?: string };
}>();
type Result = { type: 'saved' | 'deleted' | 'copied' | 'started' | 'opened' };
const emit = defineEmits<{ modalResult: [result: Result] }>();

interface Draft {
  title: string;
  instruction: string;
}

const detail = ref<AiTemplateDetail>();
const draft = ref<Draft>({ title: '', instruction: '' });
// Nothing is changed before the template is read: no words of it yet.
const saved = ref(JSON.stringify(draft.value));
const busy = ref<'save' | 'run' | 'copy' | 'delete'>();
const error = ref('');
const loading = ref(Boolean(modalData.templateId));

const template = computed(() => detail.value?.template);
const builtin = computed(() => Boolean(template.value?.builtin));
const isNew = computed(() => !modalData.templateId);
const dirty = computed(() => JSON.stringify(draft.value) !== saved.value);

function draftOf(detail: AiTemplateDetail): Draft {
  const { template } = detail;
  return { title: template.title, instruction: template.instruction };
}

async function load() {
  if (!modalData.templateId) return;
  detail.value = await $fetch<AiTemplateDetail>(
    `/api/admin/ai/templates/${modalData.templateId}`,
  );
  draft.value = draftOf(detail.value);
  saved.value = JSON.stringify(draft.value);
}

onMounted(async () => {
  try {
    await load();
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
  } finally {
    loading.value = false;
  }
});

async function save() {
  if (busy.value) return;
  const form = draft.value;
  busy.value = 'save';
  error.value = '';
  const body = { title: form.title, instruction: form.instruction };
  try {
    await $fetch(
      isNew.value
        ? '/api/admin/ai/templates'
        : `/api/admin/ai/templates/${modalData.templateId}`,
      { method: isNew.value ? 'POST' : 'PATCH', body },
    );
    emit('modalResult', { type: 'saved' });
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
    busy.value = undefined;
  }
}

/** Opened in a new session, its words wait for an entity or more words. */
function open() {
  if (busy.value || !template.value) return;
  emit('modalResult', { type: 'opened' });
  void navigateTo(newSessionLocation({ template: template.value.templateId }));
}

async function run() {
  if (busy.value || !template.value) return;
  busy.value = 'run';
  const started = await runAiCheck(template.value);
  busy.value = undefined;
  if (started) emit('modalResult', { type: 'started' });
}

async function copy() {
  if (busy.value || !template.value) return;
  busy.value = 'copy';
  error.value = '';
  try {
    await $fetch(`/api/admin/ai/templates/${template.value.templateId}/copy`, {
      method: 'POST',
    });
    emit('modalResult', { type: 'copied' });
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
    busy.value = undefined;
  }
}

async function remove() {
  if (busy.value || !template.value) return;
  if (
    !window.confirm(
      phrase.value.ai_template_delete_confirm(publicText(template.value.title)),
    )
  )
    return;
  busy.value = 'delete';
  error.value = '';
  try {
    await $fetch(`/api/admin/ai/templates/${template.value.templateId}`, {
      method: 'DELETE',
    });
    emit('modalResult', { type: 'deleted' });
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
    busy.value = undefined;
  }
}

const canSave = computed(
  () =>
    !builtin.value &&
    !busy.value &&
    !loading.value &&
    (isNew.value || dirty.value) &&
    draft.value.title.trim() !== '' &&
    draft.value.instruction.trim() !== '',
);

const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
useSaveShortcut(() => void save(), {
  canSave,
  root: () => modalContainer.value?.root,
  exclusive: true,
});
// A request written and not saved is not dropped by a stray Escape.
useModalCloseGuard(
  () =>
    loading.value ||
    builtin.value ||
    !(isNew.value
      ? draft.value.instruction.trim() || draft.value.title.trim()
      : dirty.value) ||
    window.confirm(phrase.value.unsaved_modal_confirm),
);
</script>

<template>
  <ModalContainer ref="modalContainer" class="max-w-140" data-template-modal>
    <template #header
      ><div class="flex items-center gap-xs p-sm">
        <!-- As its shell draws it, so that what arrives only fills it in. -->
        <ModalTitle
          icon="template"
          :title="
            isNew
              ? phrase.ai_template_modal_new
              : builtin && template
                ? publicText(template.title)
                : phrase.ai_template_modal_title
          "
          class="flex-1"
        />
        <ModalHeaderButton
          v-if="template"
          :icon="busy === 'copy' ? 'loading' : 'template'"
          :label="phrase.ai_template_copy"
          :disabled="Boolean(busy)"
          data-template-copy
          @click="copy"
        />
        <ModalHeaderButton
          icon="close"
          :label="phrase.close_modal"
          @click="closeModal"
        />
        <ModalHeaderButton
          v-if="!builtin"
          variant="accent"
          :label="canSave || isNew ? phrase.save : phrase.saved"
          :disabled="!canSave"
          data-template-save
          @click="save"
          >{{
            canSave || isNew ? phrase.save : phrase.saved
          }}</ModalHeaderButton
        >
      </div></template
    >
    <ModalWaiting v-if="loading" class="h-32" />
    <div v-else class="flex flex-col gap-md p-sm sm:p-md">
      <p v-if="error" class="text-sm text-text-error">
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>

      <!-- A check's words are the code's: quoted on the modal's own ground. -->
      <Field v-if="!builtin">
        <FieldLabel required>{{ phrase.ai_template_name }}</FieldLabel>
        <FieldInput
          v-model="draft.title"
          required
          :maxlength="AI_TEMPLATE_TITLE_MAX"
          :placeholder="phrase.ai_template_name_placeholder"
          data-template-title
        />
      </Field>

      <Field>
        <FieldLabel :required="!builtin">{{
          phrase.ai_template_instruction
        }}</FieldLabel>
        <p
          v-if="builtin && template"
          class="border-l-2 border-border-2 pl-sm leading-normal
            whitespace-pre-line"
        >
          {{ publicText(template.instruction) }}
        </p>
        <FieldTextarea
          v-else
          v-model="draft.instruction"
          required
          rows="5"
          :maxlength="AI_TEMPLATE_INSTRUCTION_MAX"
          :placeholder="phrase.ai_template_instruction_placeholder"
          data-template-instruction
        />
      </Field>

      <section v-if="detail?.sessions.length" class="flex flex-col gap-xs">
        <h3 class="text-sm font-semibold text-text-2">
          {{ phrase.ai_template_sessions }}
        </h3>
        <ul class="-mx-2 flex flex-col" data-template-sessions>
          <li v-for="session in detail.sessions" :key="session.sessionUuid">
            <AiSessionLink :item="session" @click="closeModal" />
          </li>
        </ul>
      </section>

      <div v-if="template" class="flex flex-wrap items-center gap-xs">
        <Button
          variant="secondary"
          class="flex h-9 shrink-0 items-center gap-xs whitespace-nowrap
            pointer-coarse:h-11"
          :disabled="Boolean(busy) || dirty"
          data-template-open-now
          @click="open"
        >
          <Icon name="ai-chat" />{{ phrase.ai_template_open }}
        </Button>
        <Button
          v-if="builtin"
          variant="secondary"
          class="flex h-9 shrink-0 items-center gap-xs whitespace-nowrap
            pointer-coarse:h-11"
          :disabled="Boolean(busy)"
          data-template-run-now
          @click="run"
        >
          <Icon :name="busy === 'run' ? 'loading' : 'list-check'" />{{
            phrase.ai_template_run
          }}
        </Button>
        <Button
          v-if="!builtin"
          variant="delete"
          class="ml-auto flex h-9 shrink-0 items-center gap-xs whitespace-nowrap
            pointer-coarse:h-11"
          :disabled="Boolean(busy)"
          data-template-delete
          @click="remove"
        >
          <Icon :name="busy === 'delete' ? 'loading' : 'delete'" />{{
            phrase.ai_template_delete
          }}
        </Button>
      </div>
    </div>
  </ModalContainer>
</template>
