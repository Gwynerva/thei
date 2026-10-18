<script lang="ts" setup>
import type { AiEntityOffer, AiFieldAsk } from '#layers/thei/shared/ai-entity';
import {
  ASSET_DESCRIPTION_MAX,
  cleanAssetDescription,
  type AssetDescription,
  type AssetDescriptionResponse,
} from '#layers/thei/shared/asset-description';

/**
 * A file's description — «Описание файла» — as a field of its own: one for
 * the file and all its variants, read and saved through any of them over the
 * version it was read at. What an AI proposes for it waits at its label;
 * with AI off it is just a field.
 *
 * Where a file is placed, `global` says the description is the file's,
 * wherever else it shows. `embedded`, the last step of the editor saves it
 * with its own «Готово» (`save()`), so the field has no button of its own;
 * `required` asks for it there, saying why under it.
 */
const props = defineProps<{
  assetUuid: string;
  global?: boolean;
  embedded?: boolean;
  required?: boolean;
}>();
const emit = defineEmits<{ saved: [description: AssetDescription] }>();

const form = reactive({ description: '' });
const stored = ref('');
const version = ref<number | null>(null);
const offers = shallowRef<AiEntityOffer[]>([]);
/** What its ✦ is answering now, and whether a model answers it. */
const asking = shallowRef<AiFieldAsk[]>([]);
const modelReady = ref(false);
const loaded = ref(false);
const saving = ref(false);
const notice = ref<{ text: string; error?: boolean } | null>(null);

const url = computed(
  () => `/api/admin/assets/${encodeURIComponent(props.assetUuid)}/description`,
);
const dirty = computed(
  () => cleanAssetDescription(form.description) !== stored.value,
);
const tooLong = computed(
  () => cleanAssetDescription(form.description).length > ASSET_DESCRIPTION_MAX,
);

function take(description: AssetDescription, keepTyped = false) {
  stored.value = description.text;
  version.value = description.updatedAt;
  if (!keepTyped) form.description = description.text;
}

let reading = 0;
async function load(keepTyped = false) {
  const ticket = ++reading;
  try {
    const read = await $fetch<AssetDescriptionResponse>(url.value);
    if (ticket !== reading) return;
    take(read, keepTyped && dirty.value);
    offers.value = read.offers ?? [];
    asking.value = read.asking ?? [];
    modelReady.value = Boolean(read.modelReady);
    if (read.waiting !== undefined) setAiWaiting(read.waiting);
    loaded.value = true;
  } catch (caught) {
    if (ticket !== reading) return;
    notice.value = {
      text: errorMessage(caught, phrase.value.asset_description_error),
      error: true,
    };
  }
}

const fileAi = provideFileAi({
  ref: () => `asset:${props.assetUuid}`,
  offers: () => offers.value,
  form: () => form,
  reload: () => load(true),
  asking: () => asking.value,
  modelReady: () => modelReady.value,
});

onMounted(() => {
  watch(
    () => props.assetUuid,
    () => {
      loaded.value = false;
      notice.value = null;
      void load();
    },
    { immediate: true },
  );
});

/** What is kept now is what the field holds. */
function settle(saved: AssetDescription) {
  take(saved);
  if (!props.embedded)
    notice.value = { text: phrase.value.asset_description_saved };
  emit('saved', saved);
}

/** Saves what was typed; true once nothing is left unsaved. */
async function save(): Promise<boolean> {
  if (!loaded.value || tooLong.value) return false;
  if (!dirty.value) return true;
  if (saving.value) return false;
  saving.value = true;
  notice.value = null;
  try {
    const saved = await $fetch<AssetDescription>(url.value, {
      method: 'PUT',
      body: {
        text: form.description,
        expectedUpdatedAt: version.value,
      },
    });
    settle(saved);
    // A proposal taken into the field and corrected there counts as
    // applied with the words saved; what was proposed is then settled
    // against the description saved.
    await fileAi.saved();
    if (offers.value.length) await load();
    return true;
  } catch (caught) {
    const status = (caught as { statusCode?: number }).statusCode;
    const current = (caught as { data?: { data?: AssetDescription } }).data
      ?.data;
    if (status === 409 && current) {
      // The words typed stay, now over the version changed elsewhere: a
      // second save puts them in its place. Words it already reads are kept.
      take(current, true);
      if (!dirty.value) {
        settle(current);
        return true;
      }
      notice.value = {
        text: phrase.value.asset_description_conflict,
        error: true,
      };
    } else
      notice.value = {
        text: errorMessage(caught, phrase.value.asset_description_error),
        error: true,
      };
    return false;
  } finally {
    saving.value = false;
  }
}

/** Something is written, or was already: what a required step waits for. */
const filled = computed(
  () => loaded.value && cleanAssetDescription(form.description).length > 0,
);
defineExpose({ save, filled, saving });

watch(
  () => form.description,
  () => {
    if (notice.value && !notice.value.error) notice.value = null;
  },
);
</script>

<template>
  <Field ai="field:description" data-file-description>
    <div class="flex items-center gap-xs">
      <FieldLabel :required class="min-w-0">
        <span :data-title-popup="phrase.asset_description_hint">{{
          phrase.asset_description
        }}</span>
      </FieldLabel>
      <span
        v-if="global"
        class="ml-auto flex shrink-0 cursor-help items-center gap-1 text-xs
          font-semibold text-text-warning"
        :data-title-popup="phrase.asset_description_global_hint"
        data-file-description-global
      >
        <Icon name="globe" />{{ phrase.asset_description_global }}
      </span>
    </div>
    <FieldTextarea
      v-model="form.description"
      :placeholder="phrase.asset_description_placeholder"
      :disabled="!loaded"
      class="max-h-60"
      data-file-description-input
      @keydown.enter.ctrl.exact.prevent="!embedded && save()"
      @keydown.enter.meta.exact.prevent="!embedded && save()"
    />
    <FieldHint v-if="required">{{ phrase.asset_description_why }}</FieldHint>
    <div
      v-if="(dirty && !embedded) || notice || tooLong"
      class="flex min-h-9 items-center justify-end gap-xs"
    >
      <p
        v-if="tooLong || notice"
        class="mr-auto text-xs"
        :class="tooLong || notice?.error ? 'text-text-error' : 'text-text-2'"
        :role="tooLong || notice?.error ? 'alert' : 'status'"
        data-file-description-notice
      >
        {{
          tooLong
            ? phrase.asset_description_too_long(ASSET_DESCRIPTION_MAX)
            : notice?.text
        }}
      </p>
      <!-- Shown only with words to save: the window's action then, in its
           own colour, as a form's «Save» lights up. -->
      <Button
        v-if="dirty && !embedded"
        class="flex h-9 items-center gap-xs"
        :disabled="saving || tooLong || !loaded"
        data-file-description-save
        @click="save"
      >
        <Icon :name="saving ? 'loading' : 'check'" />
        <span>{{ phrase.asset_description_save }}</span>
      </Button>
    </div>
  </Field>
</template>
