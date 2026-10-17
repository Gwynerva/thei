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
import AssetPanelSection from '#layers/thei/app/modals/asset-modal/AssetPanelSection.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import type { IconName } from '#thei/icons';
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
    /** The window's icon; the file's kind by default, once the file is known. */
    icon?: IconName;
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
    /** The caption's label, where it is more than a caption: a description. */
    captionLabel?: string;
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
/** The window says what it holds by its kind, once the file is known. */
const windowIcon = computed<IconName | undefined>(
  () =>
    props.modalData.icon ??
    (asset.value?.media
      ? 'media'
      : asset.value?.audio
        ? 'audio'
        : asset.value
          ? 'file'
          : undefined),
);
const dimensions = computed(() => {
  const { width, height } = asset.value?.media ?? {};
  return width && height ? { width, height } : undefined;
});
const captionLabel = computed(
  () =>
    props.modalData.captionLabel ??
    (props.modalData.captionAsTextarea
      ? phrase.value.content_description
      : phrase.value.content_caption),
);
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
  <AssetModal
    ref="assetModal"
    :aside-title="modalData.asideTitle"
    :aside-icon="windowIcon"
  >
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
      <div class="flex flex-col divide-y divide-border-1 text-sm">
        <AssetPanelSection>
          <div
            v-if="loadFailure"
            role="alert"
            class="flex flex-col items-start gap-sm text-text-error"
          >
            <span><Icon name="warning" class="mr-xs" />{{ loadFailure }}</span>
            <Button variant="secondary" @click="load">
              {{ phrase.asset_library_retry }}
            </Button>
          </div>
          <!-- Until the file is known its facts wait in place, so the fields
               under them do not move when it is. -->
          <AssetModalFileInfo
            v-else
            :extension="asset?.extension"
            :size="asset?.size"
            :dimensions="dimensions"
            :duration="asset?.audio?.duration"
            :channels="asset?.audio?.channels"
            :archived-original="modalData.archivedOriginal"
            :pending="!asset"
          />
        </AssetPanelSection>

        <!-- What belongs to this place: its title, its caption, who sees it. -->
        <AssetPanelSection
          v-if="
            modalData.showTitle || modalData.showCaption || modalData.showAccess
          "
          :title="phrase.asset_here"
          data-asset-here
        >
          <div class="flex flex-col gap-sm">
            <Field v-if="modalData.showTitle">
              <FieldLabel :required="modalData.requireTitle">{{
                phrase.content_title
              }}</FieldLabel>
              <FieldInput
                v-model="title"
                :required="modalData.requireTitle"
                :error="titleError"
                :aria-label="phrase.content_title"
                @submit="confirm"
              />
            </Field>

            <Field v-if="modalData.showCaption">
              <FieldLabel>{{ captionLabel }}</FieldLabel>
              <FieldTextarea
                v-if="modalData.captionAsTextarea"
                v-model="caption"
                :aria-label="captionLabel"
              />
              <FieldInput v-else v-model="caption" :aria-label="captionLabel" />
            </Field>

            <FieldToggle v-if="modalData.showAccess" v-model="isPrivate">
              <div
                @click="isPrivate = !isPrivate"
                :data-title-popup="phrase.asset_private_access_hint"
                class="flex-1 cursor-help text-text-2"
              >
                <Icon name="lock-close" class="mr-xs" />
                <span>{{ phrase.asset_private_access }}</span>
              </div>
            </FieldToggle>
          </div>
        </AssetPanelSection>

        <!-- The file's own description, saved on its own: it is the file's,
             wherever it is placed. -->
        <AssetPanelSection :title="phrase.asset">
          <FileDescriptionField
            :asset-uuid="modalData.asset.assetUuid"
            global
          />
        </AssetPanelSection>
      </div>
    </template>

    <template #footer>
      <ModalHeaderButton
        v-if="modalData.showDetach ?? true"
        icon="delete"
        variant="delete"
        :label="phrase.asset_detach_hint"
        data-asset-detach
        @click="emit('modalResult', { type: 'detach' })"
      />
      <!-- Two words side by side in a panel 300px wide: each takes half. -->
      <Button
        variant="secondary"
        class="flex h-9 min-w-0 flex-1 items-center justify-center gap-xs"
        data-asset-replace
        @click="replace"
      >
        <Icon v-if="!modalData.primaryLabel" name="edit" class="shrink-0" />
        <span class="truncate">{{ phrase.asset_replace }}</span>
      </Button>
      <Button
        v-if="modalData.primaryLabel"
        variant="primary"
        class="flex h-9 min-w-0 flex-1 items-center justify-center
          font-semibold"
        data-asset-confirm
        @click="confirm"
      >
        <span class="truncate">{{ modalData.primaryLabel }}</span>
      </Button>
    </template>
  </AssetModal>
</template>
