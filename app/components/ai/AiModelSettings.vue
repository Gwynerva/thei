<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import {
  AI_SERVICES,
  aiModelName,
  aiServiceOf,
  type AiCheckResponse,
  type AiModelSettings,
  type AiModelStateKind,
  type AiModelsResponse,
} from '#layers/thei/shared/ai-model';
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
import type { SelectOption } from '#layers/thei/app/components/field/FieldSelect.vue';

/**
 * The model that answers in sessions and templates: where it stands, what
 * it spent this month, and its settings — which service, its address when
 * it is the owner's own, the key, the model and the month's limit. The
 * models come from the service's own list where it gives one, and are typed
 * in where it does not. A check tries the model as the form has it, saved
 * or not.
 */
const requestFetch = useRequestFetch();

const { data: loaded } = await useAsyncData('ai-model-settings', () =>
  requestFetch<AiModelSettings>('/api/admin/ai/model'),
);

/** The limit is typed in millions, a whole number or with a decimal. */
const MILLION = 1_000_000;
/** A service chosen by its address alone: one not on the list. */
const CUSTOM = 'custom';

interface Draft {
  mode: 'none' | 'api';
  /** A service's id, `custom` for the owner's own address, or none yet. */
  service: string;
  baseUrl: string;
  model: string;
  monthlyMillions: string;
}

function draftOf(settings: AiModelSettings): Draft {
  const service = aiServiceOf(settings);
  return {
    mode: settings.provider === 'none' ? 'none' : 'api',
    service: service?.id ?? (settings.baseUrl.trim() ? CUSTOM : ''),
    baseUrl: settings.baseUrl,
    // The model the settings mean, named: what runs is what the form shows.
    model: aiModelName(settings),
    monthlyMillions: String(settings.monthlyTokens / MILLION),
  };
}

const settings = ref<AiModelSettings | null>(loaded.value ?? null);
const draft = ref<Draft | null>(
  settings.value ? draftOf(settings.value) : null,
);
const saved = ref(JSON.stringify(draft.value));
const newKey = ref('');
const busy = ref(false);
const error = ref('');
const check = ref<AiCheckResponse | null>(null);

const dirty = computed(
  () => JSON.stringify(draft.value) !== saved.value || Boolean(newKey.value),
);
useLeaveGuard({ dirty: () => dirty.value, inTab: true });

const service = computed(() =>
  AI_SERVICES.find((one) => one.id === draft.value?.service),
);
/** Whether the address is the owner's to type: their own, or their machine's. */
const addressShown = computed(
  () => draft.value?.service === CUSTOM || Boolean(service.value?.local),
);

// A service chosen from the list brings its address along.
watch(
  () => draft.value?.service,
  (id, before) => {
    if (!draft.value || before === undefined || id === before) return;
    const chosen = AI_SERVICES.find((one) => one.id === id);
    if (chosen) draft.value.baseUrl = chosen.baseUrl;
    else if (id === CUSTOM) draft.value.baseUrl = '';
    models.value = [];
    void loadModels();
  },
);

const numbers = computed(
  () =>
    new Intl.NumberFormat(language.value.code, { maximumFractionDigits: 1 }),
);

/** What is wrong with the form, in words; empty when it may be saved. */
const problem = computed(() => {
  const form = draft.value;
  if (!form) return '';
  const millions = Number(form.monthlyMillions.replace(',', '.').trim());
  if (!form.monthlyMillions.trim() || !(millions > 0) || millions > 10_000)
    return phrase.value.ai_model_limit_invalid;
  if (form.mode === 'none') return '';
  if (!form.service) return phrase.value.ai_model_service_missing;
  if (addressShown.value && !/^https?:\/\/\S+$/i.test(form.baseUrl.trim()))
    return phrase.value.ai_model_address_invalid;
  if (!form.model.trim()) return phrase.value.ai_model_missing;
  return '';
});

function body(form: Draft) {
  return {
    provider:
      form.mode === 'none'
        ? 'none'
        : (service.value?.provider ?? (form.service ? 'openai' : 'none')),
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    monthlyTokens: Math.round(
      Number(form.monthlyMillions.replace(',', '.').trim()) * MILLION,
    ),
    ...(newKey.value.trim() ? { apiKey: newKey.value } : {}),
  };
}

function took(result: AiModelSettings) {
  settings.value = result;
  draft.value = draftOf(result);
  saved.value = JSON.stringify(draft.value);
  newKey.value = '';
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await action();
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.ai_error);
  } finally {
    busy.value = false;
  }
}

function save() {
  if (!draft.value || problem.value) return;
  const form = draft.value;
  return run(async () => {
    took(
      await $fetch<AiModelSettings>('/api/admin/ai/model', {
        method: 'PUT',
        body: body(form),
      }),
    );
    check.value = null;
    // The sessions tab reads the model's state too.
    await refreshNuxtData('ai-model');
  });
}
useSaveShortcut(() => void save(), {
  canSave: computed(() => dirty.value && !problem.value && !busy.value),
});

function removeKey() {
  if (!window.confirm(phrase.value.ai_model_key_remove_confirm)) return;
  return run(async () => {
    // Only the key goes: what is being edited stays as it is.
    settings.value = await $fetch<AiModelSettings>('/api/admin/ai/model/key', {
      method: 'DELETE',
    });
  });
}

function checkModel() {
  if (!draft.value || problem.value) return;
  const form = draft.value;
  return run(async () => {
    check.value = await $fetch<AiCheckResponse>('/api/admin/ai/model/check', {
      method: 'POST',
      body: body(form),
    });
    settings.value = await $fetch<AiModelSettings>('/api/admin/ai/model');
  });
}

// ---- The service's models ----------------------------------------------

const models = ref<string[]>([]);
const modelsState = ref<'idle' | 'loading' | 'listed' | 'unlisted'>('idle');

/**
 * Asks the service which models it offers, with the key typed in or the
 * saved one. A service that lists none leaves the name to be typed.
 */
async function loadModels() {
  const form = draft.value;
  if (!form || form.mode !== 'api' || !form.service) return;
  if (addressShown.value && !/^https?:\/\/\S+$/i.test(form.baseUrl.trim()))
    return;
  modelsState.value = 'loading';
  try {
    const answer = await $fetch<AiModelsResponse>(
      '/api/admin/ai/model/models',
      { method: 'POST', body: body(form) },
    );
    models.value = answer.models;
  } catch {
    models.value = [];
  }
  modelsState.value = models.value.length ? 'listed' : 'unlisted';
}

/**
 * The list is asked for when the owner reaches for the model, not on every
 * visit: asking sends the key to the service.
 */
function modelsWanted() {
  if (modelsState.value === 'idle') void loadModels();
}

/**
 * The model as the select shows it: one the service listed, or "another"
 * with a field of its own for a name it did not list.
 */
const otherModel = ref(false);
const modelChoice = computed({
  get: () => {
    const value = draft.value?.model ?? '';
    return otherModel.value || (value && !models.value.includes(value))
      ? 'other'
      : value;
  },
  set: (choice: string) => {
    if (!draft.value) return;
    otherModel.value = choice === 'other';
    if (choice !== 'other') draft.value.model = choice;
  },
});
/** The service's models, and apart from them one typed in. */
const modelOptions = computed<SelectOption[]>(() => [
  ...models.value.map((model, index) => ({
    value: model,
    label: model,
    divider: index === models.value.length - 1,
  })),
  { value: 'other', label: phrase.value.ai_model_other },
]);

// ---- Choices -----------------------------------------------------------

// Two short choices; what the chosen one means is said once, under them.
const modeOptions = computed<FieldOptions>(() => ({
  none: {
    icon: 'person',
    title: phrase.value.ai_model_provider_cards.none.title,
  },
  api: {
    icon: 'key',
    title: phrase.value.ai_model_provider_cards.api.title,
  },
}));

/** The services Thei knows, and apart from them the owner's own address. */
const serviceOptions = computed<SelectOption[]>(() => [
  ...AI_SERVICES.map((one, index) => ({
    value: one.id,
    label: one.local ? phrase.value.ai_model_service_local(one.name) : one.name,
    divider: index === AI_SERVICES.length - 1,
  })),
  { value: CUSTOM, label: phrase.value.ai_model_service_custom },
]);

// ---- Where it stands ---------------------------------------------------

const STATE_ICONS = {
  ready: 'check',
  off: 'power',
  none: 'person',
  'no-key': 'warning',
  'no-address': 'warning',
  'no-model': 'warning',
  budget: 'warning',
} as const satisfies Record<AiModelStateKind, IconName>;

/** A phrase that stands on its own begins with a capital. */
function sentence(text: string) {
  return text.charAt(0).toLocaleUpperCase(language.value.code) + text.slice(1);
}

/** This month's spending against the limit, for the bar and its line. */
const usage = computed(() => {
  if (!settings.value) return null;
  const { month } = settings.value.usage;
  const limit = settings.value.monthlyTokens;
  const monthName = new Intl.DateTimeFormat(language.value.code, {
    month: 'long',
  }).format(new Date());
  const average = settings.value.averageTurn;
  return {
    share: Math.min(1, month / limit),
    line: phrase.value.ai_model_usage_line(
      sentence(monthName),
      numbers.value.format(month / MILLION),
      numbers.value.format(limit / MILLION),
    ),
    average:
      average === null
        ? ''
        : phrase.value.ai_model_average(numbers.value.format(average / 1000)),
  };
});

const checkIcons = {
  ok: 'check',
  key: 'warning',
  model: 'warning',
  address: 'warning',
  busy: 'pause-circle',
  error: 'warning',
} as const satisfies Record<AiCheckResponse['outcome'], IconName>;
</script>

<template>
  <div v-if="draft && settings" class="flex flex-col gap-lg">
    <!-- Where it stands, and this month's spending under it. -->
    <div class="flex flex-col gap-xs">
      <div class="flex flex-wrap items-center justify-between gap-x-sm gap-y-1">
        <p
          class="flex min-w-0 items-center gap-xs text-sm font-semibold"
          :class="
            settings.state === 'ready'
              ? 'text-text-success'
              : settings.state === 'none' || settings.state === 'off'
                ? 'text-text-3'
                : 'text-text-warning'
          "
          data-model-state
          :data-state="settings.state"
        >
          <Icon
            :name="STATE_ICONS[settings.state]"
            class="shrink-0"
            aria-hidden="true"
          />
          <span class="min-w-0 wrap-break-word">{{
            sentence(phrase.ai_model_states[settings.state])
          }}</span>
        </p>
        <p
          v-if="usage && settings.provider !== 'none'"
          class="text-xs text-text-2 tabular-nums"
          data-model-usage
        >
          {{ usage.line }}
        </p>
      </div>
      <template v-if="usage && settings.provider !== 'none'">
        <div class="h-1.5 overflow-hidden rounded-full bg-bg-3">
          <div
            class="h-full rounded-full"
            :class="usage.share >= 1 ? 'bg-text-error' : 'bg-accent'"
            :style="{ width: `${Math.max(usage.share * 100, 1)}%` }"
          ></div>
        </div>
        <p v-if="usage.average" class="text-xs text-text-3">
          {{ usage.average }}
        </p>
      </template>
    </div>

    <Field>
      <FieldLabel>{{ phrase.ai_model_provider_label }}</FieldLabel>
      <FieldOptions v-model="draft.mode" :options="modeOptions" />
      <FieldHint>{{
        phrase.ai_model_provider_cards[draft.mode].text
      }}</FieldHint>
    </Field>

    <div v-if="draft.mode === 'api'" class="flex flex-col gap-md">
      <Field>
        <FieldLabel required>{{ phrase.ai_model_service_label }}</FieldLabel>
        <FieldSelect
          v-model="draft.service"
          :options="serviceOptions"
          :placeholder="phrase.ai_model_service_choose"
          wide
        />
        <!-- What files its model is shown: Claude takes no sound. -->
        <FieldHint v-if="service?.provider === 'anthropic'">{{
          phrase.ai_model_no_sound
        }}</FieldHint>
      </Field>
      <Field v-if="addressShown">
        <FieldLabel required>{{ phrase.ai_model_base_url }}</FieldLabel>
        <FieldInput
          v-model="draft.baseUrl"
          autocomplete="off"
          no-typography
          placeholder="https://example.com/v1"
          @blur="loadModels"
        />
      </Field>
      <template v-if="draft.service">
        <Field>
          <FieldLabel :required="!service?.local">{{
            phrase.ai_model_key
          }}</FieldLabel>
          <div class="flex items-center gap-xs">
            <FieldInput
              v-model="newKey"
              wrapper-class="min-w-0 flex-1"
              type="password"
              autocomplete="off"
              no-typography
              :placeholder="
                settings.keySet
                  ? phrase.ai_model_key_replace_placeholder(settings.keyHint)
                  : phrase.ai_model_key_placeholder
              "
              @blur="loadModels"
            />
            <Button
              v-if="settings.keySet"
              variant="delete"
              size="icon"
              class="pointer-coarse:size-11"
              :disabled="busy"
              :aria-label="phrase.ai_model_key_remove"
              :data-title-popup="phrase.ai_model_key_remove"
              @click="removeKey"
            >
              <Icon name="delete" />
            </Button>
          </div>
          <FieldHint v-if="service?.keysUrl">
            <a
              :href="service.keysUrl"
              target="_blank"
              rel="noopener"
              class="font-semibold text-text-2 underline hocus:text-accent"
              >{{ phrase.ai_model_key_where }}</a
            >
          </FieldHint>
          <FieldHint v-else-if="service?.local">{{
            phrase.ai_model_key_optional
          }}</FieldHint>
        </Field>

        <Field>
          <div class="flex items-center justify-between gap-sm">
            <FieldLabel required>{{ phrase.ai_model_label }}</FieldLabel>
            <button
              type="button"
              class="flex shrink-0 cursor-pointer items-center gap-1
                rounded-normal px-xs py-0.5 text-xs text-text-3 transition
                pointer-coarse:min-h-11 pointer-coarse:px-sm hocus:bg-bg-3
                hocus:text-accent"
              :disabled="modelsState === 'loading'"
              :aria-label="phrase.ai_model_list_refresh"
              :data-title-popup="phrase.ai_model_list_refresh"
              @click="loadModels"
            >
              <Icon
                :name="modelsState === 'loading' ? 'loading' : 'refresh'"
                aria-hidden="true"
              /><span class="max-sm:hidden">{{
                phrase.ai_model_list_refresh
              }}</span>
            </button>
          </div>
          <template v-if="models.length">
            <FieldSelect
              v-model="modelChoice"
              :options="modelOptions"
              :placeholder="phrase.ai_model_choose"
              wide
            />
            <FieldInput
              v-if="modelChoice === 'other'"
              v-model="draft.model"
              autocomplete="off"
              no-typography
              :placeholder="phrase.ai_model_id_placeholder"
            />
          </template>
          <FieldInput
            v-else
            v-model="draft.model"
            autocomplete="off"
            no-typography
            :placeholder="phrase.ai_model_id_placeholder"
            @focusin="modelsWanted"
          />
          <FieldHint v-if="modelsState === 'unlisted'">{{
            phrase.ai_model_unlisted
          }}</FieldHint>
        </Field>
      </template>

      <Field>
        <FieldLabel>{{ phrase.ai_model_limit_label }}</FieldLabel>
        <FieldInput
          v-model="draft.monthlyMillions"
          wrapper-class="w-full max-w-64"
          inputmode="decimal"
          no-typography
        >
          <template #suffix>{{ phrase.ai_model_limit_unit }}</template>
        </FieldInput>
        <FieldHint>
          {{ phrase.ai_model_limit_hint }}
          <span
            class="cursor-help underline decoration-dotted underline-offset-4"
            :data-title-popup="phrase.ai_model_limit_tokens"
            >{{ phrase.ai_model_limit_tokens_link }}</span
          >
        </FieldHint>
      </Field>

      <p
        v-if="check"
        class="flex items-start gap-xs text-sm"
        :class="
          check.outcome === 'ok' ? 'text-text-success' : 'text-text-warning'
        "
        data-model-check
      >
        <Icon :name="checkIcons[check.outcome]" class="mt-0.5 shrink-0" />
        <span class="min-w-0 wrap-break-word">
          <span class="font-semibold">{{ draft.model }}</span
          >: {{ phrase.ai_model_check_outcomes[check.outcome] }}
          <span v-if="check.detail" class="block text-xs text-text-3">{{
            check.detail
          }}</span>
        </span>
      </p>
    </div>

    <div class="flex flex-col gap-xs">
      <p v-if="problem && dirty" class="text-sm text-text-warning">
        <Icon name="warning" class="mr-xs" />{{ problem }}
      </p>
      <p v-if="error" class="text-sm text-text-error">
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>
      <div class="flex flex-wrap justify-end gap-xs">
        <Button
          v-if="draft.mode === 'api'"
          variant="secondary"
          class="flex h-9 items-center gap-xs whitespace-nowrap"
          :disabled="busy || Boolean(problem)"
          data-model-check-button
          @click="checkModel"
        >
          <Icon name="pulse" />{{ phrase.ai_model_check }}
        </Button>
        <Button
          class="flex h-9 items-center gap-xs font-semibold whitespace-nowrap"
          :disabled="busy || !dirty || Boolean(problem)"
          data-model-save
          @click="save"
        >
          <Icon v-if="busy" name="loading" />
          {{ dirty ? phrase.save : phrase.saved }}
        </Button>
      </div>
    </div>
  </div>
</template>
