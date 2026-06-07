<script lang="ts" setup>
import type { AssetReplaceResult } from '#layers/thei/shared/api/asset';
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPreviewFile from '#layers/thei/app/modals/asset-modal/AssetModalPreviewFile.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';
import UploadSettingsSection from '#layers/thei/app/modals/upload-settings/UploadSettingsSection.vue';

type AccessLevel = 'project' | 'private';

type ProjectAssetDetailsResult =
  | {
      type: 'confirm';
      asset: AssetReplaceResult;
      title?: string;
      caption?: string;
      access?: AccessLevel;
    }
  | {
      type: 'replace';
      title?: string;
      caption?: string;
      access?: AccessLevel;
    }
  | { type: 'detach' };

const emit = defineEmits<{
  modalResult: [result: ProjectAssetDetailsResult];
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
    captionLabel?: string;
    captionAsTextarea?: boolean;
    showAccess?: boolean;
    initialAccess?: AccessLevel;
    showDetach?: boolean;
  };
}>();

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const title = ref(props.modalData.initialTitle ?? '');
const caption = ref(props.modalData.initialCaption ?? '');
const access = ref<AccessLevel>(props.modalData.initialAccess ?? 'project');
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
    props.modalData.asset.videoUrl ??
    props.modalData.asset.previewUrl,
);
const isMedia = computed(() =>
  Boolean(props.modalData.asset.previewUrl || props.modalData.asset.videoUrl),
);
const previewSrc = computed(
  () =>
    props.modalData.asset.videoUrl ??
    props.modalData.asset.previewUrl ??
    props.modalData.asset.assetUrl,
);
const previewExtension = computed(() =>
  props.modalData.asset.videoUrl
    ? props.modalData.asset.extension
    : props.modalData.asset.extension,
);

function currentPatch() {
  return {
    title: props.modalData.showTitle
      ? title.value.trim() || undefined
      : undefined,
    caption: props.modalData.showCaption
      ? caption.value.trim() || undefined
      : undefined,
    access: props.modalData.showAccess ? access.value : undefined,
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
        :extension="previewExtension"
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
          <UploadSettingsSection
            :active="true"
            :title="phrase.showcase_details"
          >
            <Field v-if="modalData.showTitle">
              <FieldLabel :required="modalData.requireTitle">
                {{ phrase.other_title }}
              </FieldLabel>
              <FieldInput
                v-model="title"
                :required="modalData.requireTitle"
                :error="titleError"
                @submit="confirm"
              />
            </Field>

            <Field v-if="modalData.showCaption">
              <FieldLabel>
                {{ modalData.captionLabel ?? phrase.showcase_caption }}
              </FieldLabel>
              <FieldTextarea
                v-if="modalData.captionAsTextarea"
                v-model="caption"
                :placeholder="phrase.showcase_caption_hint"
              />
              <FieldInput
                v-else
                v-model="caption"
                :placeholder="phrase.showcase_caption_hint"
              />
            </Field>

            <Field v-if="modalData.showAccess">
              <FieldOptions
                v-model="access"
                :options="{
                  project: { title: phrase.showcase_access_same_as_project },
                  private: { title: phrase.showcase_access_private },
                }"
              />
            </Field>
          </UploadSettingsSection>
        </template>

        <div class="flex flex-col gap-sm p-sm">
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
