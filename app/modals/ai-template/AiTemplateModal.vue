<script setup lang="ts">
import {
  AI_TEMPLATE_INSTRUCTION_MAX,
  AI_TEMPLATE_TITLE_MAX,
  type AiTemplateDetail,
} from '#layers/thei/shared/ai-template';
import {
  aiModelName,
  type AiModelsResponse,
} from '#layers/thei/shared/ai-model';
import type { SelectOption } from '#layers/thei/app/components/field/FieldSelect.vue';
import ModalContainer from '../ModalContainer.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';
import ModalTitle from '../ModalTitle.vue';
import ModalWaiting from '../ModalWaiting.vue';

/**
 * One template's settings: its request in the owner's words and which model
 * answers it, with the sessions it started. A built-in check keeps its
 * words: the owner sets its model, or makes a copy to rewrite as a request
 * of their own. A new one starts here too.
 */
const { modalData } = defineProps<{
  modalData: { templateId?: string };
}>();
type Result = { type: 'saved' | 'deleted' | 'copied' | 'started' | 'opened' };
const emit = defineEmits<{ modalResult: [result: Result] }>();

interface Draft {
  title: string;
  instruction: string;
  model: string;
}

const detail = ref<AiTemplateDetail>();
/** What the connection answers with, read as the AI page reads it. */
const { data: connection } = useAiModel();
const models = ref<string[]>([]);
const draft = ref<Draft>({
  title: '',
  instruction: '',
  model: '',
});
const saved = ref('');
const busy = ref<'save' | 'run' | 'copy' | 'delete'>();
const error = ref('');
const loading = ref(Boolean(modalData.templateId));

const template = computed(() => detail.value?.template);
const builtin = computed(() => Boolean(template.value?.builtin));
const isNew = computed(() => !modalData.templateId);
const dirty = computed(() => JSON.stringify(draft.value) !== saved.value);

function draftOf(detail: AiTemplateDetail): Draft {
  const { template } = detail;
  return {
    title: template.title,
    instruction: template.instruction,
    model: template.model,
  };
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

/**
 * The models the connection's service offers, asked for when the owner
 * reaches for the field, not on every opening: asking sends the API key.
 */
let modelsAsked = false;
function modelsWanted() {
  if (modelsAsked) return;
  modelsAsked = true;
  void $fetch<AiModelsResponse>('/api/admin/ai/model/models', {
    method: 'POST',
    body: {},
  })
    .then((answer) => (models.value = answer.models))
    .catch(() => {});
}

const connectionModel = computed(() =>
  connection.value ? aiModelName(connection.value) : '',
);

/**
 * The model as the select shows it, once the service has listed its own:
 * the connection's, one of the listed, or «another» with a field of its own
 * for a name the service did not list.
 */
const OTHER = 'other';
const otherModel = ref(false);
const modelChoice = computed({
  get: () => {
    const value = draft.value.model;
    return otherModel.value || (value && !models.value.includes(value))
      ? OTHER
      : value;
  },
  set: (choice: string) => {
    otherModel.value = choice === OTHER;
    if (choice !== OTHER) draft.value.model = choice;
  },
});
const modelOptions = computed<SelectOption[]>(() => [
  {
    value: '',
    label: connectionModel.value
      ? phrase.value.ai_template_model_placeholder(connectionModel.value)
      : phrase.value.ai_template_model_connection,
    divider: true,
  },
  ...models.value.map((model, index) => ({
    value: model,
    label: model,
    divider: index === models.value.length - 1,
  })),
  { value: OTHER, label: phrase.value.ai_model_other },
]);

async function save() {
  if (busy.value) return;
  const form = draft.value;
  busy.value = 'save';
  error.value = '';
  const body = {
    model: form.model.trim(),
    ...(builtin.value
      ? {}
      : { title: form.title, instruction: form.instruction }),
  };
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

async function run() {
  if (busy.value || !template.value) return;
  // A ready-made request is opened, not run: its words wait to be added to.
  if (!builtin.value) {
    emit('modalResult', { type: 'opened' });
    void navigateTo(
      newSessionLocation({ template: template.value.templateId }),
    );
    return;
  }
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
    !busy.value &&
    !loading.value &&
    (isNew.value || dirty.value) &&
    (builtin.value ||
      (draft.value.title.trim() !== '' &&
        draft.value.instruction.trim() !== '')),
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
    !(isNew.value
      ? draft.value.instruction.trim() || draft.value.title.trim()
      : dirty.value) || window.confirm(phrase.value.unsaved_modal_confirm),
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
          icon="close"
          :label="phrase.close_modal"
          @click="closeModal"
        />
        <ModalHeaderButton
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

      <!-- Typed until the service has listed its models, then chosen. -->
      <Field>
        <FieldLabel>{{ phrase.ai_template_model }}</FieldLabel>
        <template v-if="models.length">
          <FieldSelect
            v-model="modelChoice"
            :options="modelOptions"
            wide
            data-template-model
          />
          <FieldInput
            v-if="modelChoice === OTHER"
            v-model="draft.model"
            autocomplete="off"
            no-typography
            :placeholder="phrase.ai_model_id_placeholder"
            data-template-model-other
          />
        </template>
        <FieldInput
          v-else
          v-model="draft.model"
          autocomplete="off"
          no-typography
          :placeholder="
            connectionModel
              ? phrase.ai_template_model_placeholder(connectionModel)
              : ''
          "
          data-template-model
          @focusin="modelsWanted"
        />
        <FieldHint>{{ phrase.ai_template_model_hint }}</FieldHint>
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
          data-template-run-now
          @click="run"
        >
          <Icon
            :name="
              busy === 'run' ? 'loading' : builtin ? 'list-check' : 'ai-chat'
            "
          />{{ builtin ? phrase.ai_template_run : phrase.ai_template_open }}
        </Button>
        <Button
          variant="secondary"
          class="flex h-9 shrink-0 items-center gap-xs bg-transparent
            whitespace-nowrap pointer-coarse:h-11"
          :disabled="Boolean(busy)"
          data-template-copy
          @click="copy"
        >
          <Icon :name="busy === 'copy' ? 'loading' : 'template'" />{{
            phrase.ai_template_copy
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
