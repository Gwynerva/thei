<script setup lang="ts">
import {
  AI_TEMPLATE_DEFAULT_OFFER,
  AI_TEMPLATE_INSTRUCTION_MAX,
  AI_TEMPLATE_TITLE_MAX,
  templateOfferKinds,
  type AiTemplateDetail,
  type AiTemplateOfferKind,
} from '#layers/thei/shared/ai-template';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import {
  aiModelName,
  type AiModelSettings,
  type AiModelsResponse,
} from '#layers/thei/shared/ai-model';
import ModalContainer from '../ModalContainer.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';

/**
 * One template's settings: its request in the owner's words, where it is
 * offered and which model answers it, with the sessions it started. A
 * built-in check keeps its words: the owner sets its model and where it is
 * offered, or makes a copy to rewrite as a request of their own. A new one
 * starts here too.
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
  offerOn: AiTemplateOfferKind[];
}

const detail = ref<AiTemplateDetail>();
const connection = ref<AiModelSettings>();
const models = ref<string[]>([]);
const draft = ref<Draft>({
  title: '',
  instruction: '',
  model: '',
  offerOn: [...AI_TEMPLATE_DEFAULT_OFFER],
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
    offerOn: [...template.offerOn],
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
  // What the connection answers with, and the models its service offers.
  void $fetch<AiModelSettings>('/api/admin/ai/model')
    .then((settings) => (connection.value = settings))
    .catch(() => {});
});

/**
 * The models the connection's service offers, asked for when the owner
 * reaches for the field, not on every opening: asking sends the key.
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

async function save() {
  if (busy.value) return;
  const form = draft.value;
  busy.value = 'save';
  error.value = '';
  const body = {
    model: form.model.trim(),
    offerOn: form.offerOn,
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

/** The kinds it may be offered on, each a toggle. */
const offerable = computed(() => templateOfferKinds(template.value?.builtin));
const offerKinds = computed(() =>
  offerable.value.map((kind) => ({
    kind,
    icon: entityTypeIcon(kind),
    label: entityTypeLabel(kind),
    on: draft.value.offerOn.includes(kind),
  })),
);

function toggleOffer(kind: AiTemplateOfferKind) {
  const on = new Set(draft.value.offerOn);
  if (on.has(kind)) on.delete(kind);
  else on.add(kind);
  draft.value.offerOn = offerable.value.filter((item) => on.has(item));
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
        <h2
          class="flex min-w-0 flex-1 items-center gap-xs px-xs text-lg
            font-bold"
        >
          <Icon name="template" class="shrink-0 text-text-3" />
          <span class="truncate">{{
            isNew
              ? phrase.ai_template_modal_new
              : builtin && template
                ? publicText(template.title)
                : phrase.ai_template_modal_title
          }}</span>
        </h2>
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
    <div v-if="loading" class="p-md text-text-3">
      <Icon name="loading" />
    </div>
    <div v-else class="flex flex-col gap-md p-sm sm:p-md">
      <p v-if="error" class="text-sm text-text-error">
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>

      <p
        v-if="builtin"
        class="flex items-start gap-xs rounded-normal bg-bg-3 px-3 py-2.5
          text-xs leading-normal text-text-2"
      >
        <Icon name="hint" class="mt-0.5 shrink-0" />{{
          phrase.ai_template_builtin_note
        }}
      </p>
      <Field v-else>
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
          class="rounded-normal border border-border-1 bg-bg-1 px-3 py-2.5
            leading-normal"
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

      <Field>
        <FieldLabel>{{ phrase.ai_template_offer_on }}</FieldLabel>
        <div
          role="group"
          class="flex flex-wrap gap-1"
          :aria-label="phrase.ai_template_offer_on"
        >
          <button
            v-for="item in offerKinds"
            :key="item.kind"
            type="button"
            class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full
              border px-3 text-xs transition pointer-coarse:h-11"
            :class="
              item.on
                ? 'border-accent bg-accent/10 font-semibold text-accent'
                : 'border-border-1 bg-bg-1 text-text-2 hocus:border-border-3'
            "
            :aria-pressed="item.on"
            :data-template-offer="item.kind"
            @click="toggleOffer(item.kind)"
          >
            <Icon :name="item.icon" class="shrink-0" />{{ item.label }}
          </button>
        </div>
        <FieldHint>{{ phrase.ai_template_offer_on_hint }}</FieldHint>
      </Field>

      <Field>
        <FieldLabel>{{ phrase.ai_template_model }}</FieldLabel>
        <FieldInput
          v-model="draft.model"
          :list="models.length ? 'ai-template-models' : undefined"
          @focusin="modelsWanted"
          :placeholder="
            connectionModel
              ? phrase.ai_template_model_placeholder(connectionModel)
              : ''
          "
          data-template-model
        />
        <datalist id="ai-template-models">
          <option v-for="name in models" :key="name" :value="name"></option>
        </datalist>
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
          class="flex h-9 items-center gap-xs pointer-coarse:h-11"
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
          class="flex h-9 items-center gap-xs bg-transparent
            pointer-coarse:h-11"
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
          class="ml-auto flex h-9 items-center gap-xs pointer-coarse:h-11"
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
