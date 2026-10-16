<script lang="ts" setup>
import type { AssetVariantsResponse } from '#layers/thei/shared/api/asset';
import { errorMessage } from '#layers/thei/app/composables/upload-draft';
import { fadeShellOut, markShellShown } from '../layer-motion';
import ModalShell from '../ModalShell.vue';
import ModalUploadSettings from './ModalUploadSettings.vue';
import { editFileModal } from './modal';
import type {
  EditFileModalData,
  UploadSettingsModalData,
  UploadSettingsResult,
} from './use-upload-settings-assets';

/**
 * The file editor, opened at once. A stored file is fetched here, with every
 * variant of it, while the window already stands in its frame; the panel is
 * drawn once all of it is known, so nothing in it moves after.
 */
const props = defineProps<{ modalData: EditFileModalData }>();
const emit = defineEmits<{ modalResult: [result: UploadSettingsResult] }>();

const { source, ...options } = props.modalData;
const ready = shallowRef<UploadSettingsModalData | undefined>(
  source.kind === 'asset' ? undefined : { ...options, source },
);
const failure = ref('');

async function load(assetUuid: string) {
  failure.value = '';
  try {
    const family = await $fetch<AssetVariantsResponse>(
      `/api/admin/assets/${assetUuid}/variants`,
    );
    const asset = family.variants.find(
      (variant) => variant.assetUuid === assetUuid,
    );
    if (!asset) {
      emit('modalResult', { type: 'asset-missing' });
      return;
    }
    ready.value = {
      ...options,
      source: { kind: 'asset', asset, variants: family.variants },
    };
  } catch (error) {
    const data =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { statusCode?: number; data?: unknown } }).data
        : undefined;
    if (data?.statusCode === 404 && !data.data) {
      emit('modalResult', { type: 'asset-missing' });
      return;
    }
    failure.value = errorMessage(
      error,
      phrase.value.upload_error_load_variants,
    );
  }
}

if (source.kind === 'asset' && import.meta.client) void load(source.assetUuid);
</script>

<template>
  <ModalUploadSettings
    v-if="ready"
    :modal-data="ready"
    @modal-result="emit('modalResult', $event)"
  />
  <Transition :css="false" appear @enter="markShellShown" @leave="fadeShellOut">
    <ModalShell
      v-if="!ready"
      :frame="editFileModal.frame"
      :title="phrase.upload_variants"
      closable
    >
      <div
        v-if="failure && source.kind === 'asset'"
        role="alert"
        class="flex flex-col items-start gap-sm p-sm text-sm text-text-error"
      >
        <span><Icon name="warning" class="mr-xs" />{{ failure }}</span>
        <Button variant="secondary" @click="load(source.assetUuid)">
          {{ phrase.asset_library_retry }}
        </Button>
      </div>
    </ModalShell>
  </Transition>
</template>
