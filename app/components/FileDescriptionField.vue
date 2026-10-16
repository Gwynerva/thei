<script lang="ts" setup>
import type { AiEntityOffer } from '#layers/thei/shared/ai-entity';
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
 */
const props = defineProps<{ assetUuid: string }>();
const emit = defineEmits<{ saved: [description: AssetDescription] }>();

const form = reactive({ description: '' });
const stored = ref('');
const version = ref<number | null>(null);
const offers = shallowRef<AiEntityOffer[]>([]);
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
    loaded.value = true;
  } catch (caught) {
    if (ticket !== reading) return;
    notice.value = {
      text: errorMessage(caught, phrase.value.asset_description_error),
      error: true,
    };
  }
}

provideFileAi({
  ref: () => `asset:${props.assetUuid}`,
  offers: () => offers.value,
  form: () => form,
  reload: () => load(true),
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

async function save() {
  if (!dirty.value || saving.value || tooLong.value || !loaded.value) return;
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
    take(saved);
    notice.value = { text: phrase.value.asset_description_saved };
    emit('saved', saved);
    // What was proposed is settled against the description saved.
    if (offers.value.length) await load();
  } catch (caught) {
    const status = (caught as { statusCode?: number }).statusCode;
    const current = (caught as { data?: { data?: AssetDescription } }).data
      ?.data;
    if (status === 409 && current) {
      take(current);
      notice.value = {
        text: phrase.value.asset_description_conflict,
        error: true,
      };
    } else
      notice.value = {
        text: errorMessage(caught, phrase.value.asset_description_error),
        error: true,
      };
  } finally {
    saving.value = false;
  }
}

watch(
  () => form.description,
  () => {
    if (notice.value && !notice.value.error) notice.value = null;
  },
);
</script>

<template>
  <Field ai="field:description" data-file-description>
    <FieldLabel>
      <span :data-title-popup="phrase.asset_description_hint">{{
        phrase.asset_description
      }}</span>
    </FieldLabel>
    <FieldTextarea
      v-model="form.description"
      :placeholder="phrase.asset_description_placeholder"
      :disabled="!loaded"
      class="max-h-60"
      data-file-description-input
      @keydown.enter.ctrl.exact.prevent="save"
      @keydown.enter.meta.exact.prevent="save"
    />
    <div
      v-if="dirty || notice || tooLong"
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
      <Button
        v-if="dirty"
        variant="secondary"
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
