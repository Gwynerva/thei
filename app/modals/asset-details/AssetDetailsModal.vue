<script lang="ts" setup>
import type { AssetReplaceResult } from '#layers/thei/shared/api/asset';
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPreviewFile from '#layers/thei/app/modals/asset-modal/AssetModalPreviewFile.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';

type AssetDetailsResult =
  | {
      type: 'confirm';
      asset: AssetReplaceResult;
      title?: string;
      caption?: string;
      isPrivate?: boolean;
    }
  | {
      type: 'replace';
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
    asset: AssetReplaceResult;
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
  () =>
    props.modalData.asset.assetUrl ??
    props.modalData.asset.media?.src,
);
const isMedia = computed(() =>
  Boolean(props.modalData.asset.media),
);
const previewSrc = computed(
  () =>
    props.modalData.asset.media?.src ??
    props.modalData.asset.assetUrl,
);
function currentPatch() {
  return {
    title: props.modalData.showTitle
      ? title.value.trim() || undefined
      : undefined,
    caption: props.modalData.showCaption
      ? caption.value.trim() || undefined
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

  emit('modalResult', {
    type: 'confirm',
    asset: props.modalData.asset,
    ...currentPatch(),
  });
}

function replace() {
  emit('modalResult', { type: 'replace', ...currentPatch() });
}
</script>

<template>
  <AssetModal :aside-title="modalData.asideTitle">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="isMedia && previewSrc"
        :key="`media:${modalData.asset.assetUuid}:${previewSrc}`"
        ref="mediaPreview"
        :extension="modalData.asset.extension"
        :src="previewSrc"
      />
      <AssetModalPreviewFile
        v-else
        :key="`file:${modalData.asset.assetUuid}:${modalData.asset.extension}`"
        :extension="modalData.asset.extension"
      />
    </template>

    <template #buttons>
      <AssetModalButton
        v-if="directHref"
        :key="`direct:${directHref}`"
        icon="arrow-outward"
        target="_blank"
        :href="directHref"
        :data-title-popup="phrase.direct_link_to_asset"
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
          <AssetModalFileInfo
            :extension="modalData.asset.extension"
            :size="modalData.asset.size"
            :archived-original="modalData.archivedOriginal"
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

          <div
            class="grid gap-sm"
            :class="
              (modalData.showDetach ?? true) ? 'grid-cols-2' : 'grid-cols-1'
            "
          >
            <Button variant="secondary" @click="replace">
              <Icon name="edit" class="mr-xs" />
              <span>{{ phrase.asset_replace }}</span>
            </Button>

            <Button
              v-if="modalData.showDetach ?? true"
              variant="delete"
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
