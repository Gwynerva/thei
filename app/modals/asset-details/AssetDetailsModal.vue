<script lang="ts" setup>
import type {
  AssetReplaceResult,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import { mapAssetVariantToReplaceResult } from '#layers/thei/app/composables/asset-wizard';
import { errorMessage } from '#layers/thei/app/composables/upload-draft';
import ModalWaiting from '#layers/thei/app/modals/ModalWaiting.vue';
import {
  archivedOriginalFromMeta,
  type ArchivedOriginalFileMeta,
} from '#layers/thei/shared/asset';
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPreviewAudio from '#layers/thei/app/modals/asset-modal/AssetModalPreviewAudio.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';
import FilePreviewContent from '#layers/thei/app/components/file-preview/FilePreviewContent.vue';
import { isAssetExtensionSafeInline } from '#layers/thei/shared/assets/formats';
import {
  normalizeCaptionText,
  normalizeHeadingText,
} from '#layers/thei/shared/terminal-punctuation';

type AssetDetailsResult =
  | {
      type: 'confirm';
      title?: string;
      caption?: string;
      isPrivate?: boolean;
    }
  | {
      type: 'replace';
      /** The file as the window knew it, so coming back needs no fetch. */
      asset?: AssetReplaceResult;
      title?: string;
      caption?: string;
      isPrivate?: boolean;
    }
  | { type: 'detach' };

const emit = defineEmits<{
  modalResult: [result: AssetDetailsResult];
}>();

const props = defineProps<{
  modalData: {
    asideTitle: string;
    /**
     * The file, or only its uuid: a place that keeps no more of it than that
     * opens the window at once, and the window fetches the rest.
     */
    asset: AssetReplaceResult | { assetUuid: string };
    archivedOriginal?: ArchivedOriginalFileMeta;
    primaryLabel?: string;
    showTitle?: boolean;
    requireTitle?: boolean;
    initialTitle?: string;
    showCaption?: boolean;
    initialCaption?: string;
    captionPlaceholder?: string;
    captionAsTextarea?: boolean;
    showAccess?: boolean;
    initialIsPrivate?: boolean;
    showDetach?: boolean;
  };
}>();

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const given = props.modalData.asset;
const fetched = shallowRef<AssetReplaceResult>();
const loadFailure = ref('');
/** The file, once known; the window and its fields are there before it. */
const asset = computed(() => ('assetUrl' in given ? given : fetched.value));

async function load() {
  loadFailure.value = '';
  try {
    const family = await $fetch<AssetVariantsResponse>(
      `/api/admin/assets/${given.assetUuid}/variants`,
    );
    const stored = family.variants.find(
      (variant) => variant.assetUuid === given.assetUuid,
    );
    if (stored) fetched.value = mapAssetVariantToReplaceResult(stored);
    else loadFailure.value = phrase.value.asset_library_missing;
  } catch (error) {
    loadFailure.value = errorMessage(
      error,
      phrase.value.upload_error_load_variants,
    );
  }
}
if (!('assetUrl' in given) && import.meta.client) void load();

const title = ref(props.modalData.initialTitle ?? '');
const caption = ref(props.modalData.initialCaption ?? '');
const isPrivate = ref(props.modalData.initialIsPrivate ?? false);
const titleSubmitAttempted = ref(false);

const titleError = computed(() => {
  if (!props.modalData.requireTitle || !props.modalData.showTitle) {
    return undefined;
  }
  if (title.value.trim()) return undefined;
  return {
    message: phrase.value.this_field_must_be_filled,
    hard: titleSubmitAttempted.value,
  };
});

const directHref = computed(
  () => asset.value?.assetUrl ?? asset.value?.media?.src,
);
const isMedia = computed(() => Boolean(asset.value?.media));
/** A browser opens the file in a tab of its own; any other is downloaded. */
const opensInTab = computed(
  () =>
    isMedia.value ||
    (asset.value ? isAssetExtensionSafeInline(asset.value.extension) : false),
);
const archivedOriginal = computed(
  () =>
    props.modalData.archivedOriginal ??
    archivedOriginalFromMeta(asset.value?.meta),
);
/** A recording is played where a picture would be shown. */
const audioPlayers = computed(() => {
  const file = asset.value;
  if (!file?.audio || !file.assetUrl) return [];
  return [
    {
      key: file.assetUuid,
      src: file.assetUrl,
      extension: file.extension,
      duration: file.audio.duration,
      peaks: file.audio.peaks,
    },
  ];
});
const previewSrc = computed(
  () => asset.value?.media?.src ?? asset.value?.assetUrl,
);
function currentPatch() {
  return {
    title: props.modalData.showTitle
      ? normalizeHeadingText(title.value.trim()) || undefined
      : undefined,
    caption: props.modalData.showCaption
      ? normalizeCaptionText(caption.value.trim()) || undefined
      : undefined,
    isPrivate: props.modalData.showAccess ? isPrivate.value : undefined,
  };
}

function confirm() {
  if (
    props.modalData.requireTitle &&
    props.modalData.showTitle &&
    !title.value.trim()
  ) {
    titleSubmitAttempted.value = true;
    return;
  }

  emit('modalResult', { type: 'confirm', ...currentPatch() });
}

function replace() {
  emit('modalResult', {
    type: 'replace',
    asset: asset.value,
    ...currentPatch(),
  });
}

// Where the primary button saves the details, the shortcut saves them too.
const assetModal =
  useTemplateRef<InstanceType<typeof AssetModal>>('assetModal');
useSaveShortcut(confirm, {
  canSave: () => Boolean(props.modalData.primaryLabel),
  root: () => assetModal.value?.root,
  exclusive: true,
});
</script>

<template>
  <AssetModal ref="assetModal" :aside-title="modalData.asideTitle">
    <template #preview>
      <ModalWaiting v-if="!asset && !loadFailure" />
      <AssetModalPreviewMedia
        v-else-if="asset && isMedia && previewSrc"
        :key="`media:${asset.assetUuid}:${previewSrc}`"
        ref="mediaPreview"
        :extension="asset.extension"
        :src="previewSrc"
        :poster="videoPosterOf(asset.media)"
        :has-audio="asset.media?.hasAudio"
      />
      <AssetModalPreviewAudio
        v-else-if="audioPlayers.length"
        :players="audioPlayers"
      />
      <FilePreviewContent
        v-else-if="asset"
        :key="`file:${asset.assetUuid}:${asset.extension}`"
        :src="asset.assetUrl"
        :extension="asset.extension"
        :size="asset.size"
        :archived-original="archivedOriginal"
        :title="modalData.asideTitle"
      />
    </template>

    <template #buttons>
      <AssetModalButton
        v-if="directHref && opensInTab"
        :key="`direct:${directHref}`"
        icon="arrow-outward"
        target="_blank"
        :href="sitePath(directHref)"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="asset && !isMedia && asset.assetUrl"
        icon="download"
        :download="downloadName(asset.assetUrl, asset.extension)"
        :href="sitePath(asset.assetUrl)"
        :data-title-popup="phrase.download_asset"
        :aria-label="phrase.download_asset"
        data-asset-download
      />
      <AssetModalButton
        v-if="isMedia"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold transition">
          {{ mediaPreview?.zoomPercent ?? 100 }}%
        </span>
      </AssetModalButton>
    </template>

    <template #aside>
      <div class="flex flex-col">
        <div class="flex flex-col gap-sm p-sm">
          <div
            v-if="loadFailure"
            role="alert"
            class="flex flex-col items-start gap-sm text-sm text-text-error"
          >
            <span><Icon name="warning" class="mr-xs" />{{ loadFailure }}</span>
            <Button variant="secondary" @click="load">
              {{ phrase.asset_library_retry }}
            </Button>
          </div>
          <!-- Until the file is known its rows wait in place, so the fields
               under them do not move when it is. -->
          <AssetModalFileInfo
            v-else
            :extension="asset?.extension"
            :size="asset?.size"
            :duration="asset?.audio?.duration"
            :channels="asset?.audio?.channels"
            :archived-original="modalData.archivedOriginal"
            :pending="!asset"
          />
        </div>

        <template
          v-if="
            modalData.showTitle || modalData.showCaption || modalData.showAccess
          "
        >
          <div
            class="flex flex-col gap-sm border-t border-border-1 p-sm text-sm
              text-text-2"
          >
            <Field v-if="modalData.showTitle">
              <FieldInput
                v-model="title"
                :required="modalData.requireTitle"
                :error="titleError"
                :placeholder="phrase.content_title"
                @submit="confirm"
              />
            </Field>

            <Field v-if="modalData.showCaption">
              <FieldTextarea
                v-if="modalData.captionAsTextarea"
                v-model="caption"
                :placeholder="
                  modalData.captionPlaceholder ?? phrase.content_description
                "
              />
              <FieldInput
                v-else
                v-model="caption"
                :placeholder="
                  modalData.captionPlaceholder ?? phrase.content_caption
                "
              />
            </Field>

            <FieldToggle v-if="modalData.showAccess" v-model="isPrivate">
              <div
                @click="isPrivate = !isPrivate"
                :data-title-popup="phrase.asset_private_access_hint"
                class="flex-1 cursor-help"
              >
                <Icon name="lock-close" class="mr-xs" />
                <span>{{ phrase.asset_private_access }}</span>
              </div>
            </FieldToggle>
          </div>
        </template>

        <div class="flex flex-col gap-sm border-t border-border-1 p-sm">
          <Button
            v-if="modalData.primaryLabel"
            variant="primary"
            class="font-semibold"
            @click="confirm"
          >
            <span>{{ modalData.primaryLabel }}</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>

          <div class="flex flex-col gap-sm">
            <Button variant="secondary" class="w-full" @click="replace">
              <Icon name="edit" class="mr-xs" />
              <span>{{ phrase.asset_replace }}</span>
            </Button>

            <Button
              v-if="modalData.showDetach ?? true"
              variant="delete"
              class="w-full"
              @click="emit('modalResult', { type: 'detach' })"
            >
              <Icon name="delete" class="mr-xs" />
              <span>{{ phrase.delete }}</span>
            </Button>
          </div>
        </div>
      </div>
    </template>
  </AssetModal>
</template>
