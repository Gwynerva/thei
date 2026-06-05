<script lang="ts" setup>
import {
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions.js';
import AssetModal from '../asset-modal/AssetModal.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalPreviewFile from '../asset-modal/AssetModalPreviewFile.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import AssetModalFileInfo from '../asset-modal/AssetModalFileInfo.vue';
import { useFileInfo } from '../asset-modal/use-file-info';

const emit = defineEmits<{
  modalResult: [result: { type: 'upload-new' }];
}>();

const props = defineProps<{
  modalData: {
    file: {
      name: string;
      extension: string;
      objectUrl: string;
      size: number;
    };
  };
}>();

const isMedia = computed(() => {
  const isImage = isExtensionAllowed(
    props.modalData.file.extension,
    imageExtensionProfile,
  );
  const isVideo = isExtensionAllowed(
    props.modalData.file.extension,
    videoExtensionProfile,
  );
  return isImage || isVideo;
});

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');

const { dimensions } = useFileInfo(
  props.modalData.file.objectUrl,
  props.modalData.file.extension,
);

const quality = ref(100);
</script>

<template>
  <AssetModal :aside-title="phrase.upload_variants">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="isMedia"
        ref="mediaPreview"
        :extension="modalData.file.extension"
        :src="modalData.file.objectUrl"
      />
      <AssetModalPreviewFile v-else :extension="modalData.file.extension" />
    </template>
    <template #buttons>
      <AssetModalButton
        icon="arrow-outward"
        target="_blank"
        :href="modalData.file.objectUrl"
        :data-title-popup="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="isMedia"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold tracking-tight transition">
          {{ mediaPreview?.zoomPercent ?? 100 }}%
        </span>
      </AssetModalButton>
    </template>
    <template #aside>
      <div class="flex flex-col">
        <!-- Original file -->
        <div class="flex flex-col gap-sm p-sm">
          <div class="font-semibold tracking-tight">Оригинальный файл</div>
          <AssetModalFileInfo
            :name="modalData.file.name"
            :extension="modalData.file.extension"
            :size="modalData.file.size"
            :dimensions="dimensions"
          />
          <Button
            variant="secondary"
            @click="emit('modalResult', { type: 'upload-new' })"
          >
            <Icon name="file" class="mr-xs" />
            <span>{{ phrase.pick_another_file }}</span>
          </Button>

          <!-- TODO: Если уже есть на сервере оригинальный файл, не показывать эти две кнопки! -->
          <Button variant="secondary">
            <Icon name="cloud-upload" class="mr-xs" />
            <span>Загрузить оригинал</span>
          </Button>
          <Button variant="primary" disabled class="font-semibold">
            <span>Использовать оригинал</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </div>

        <hr
          class="h-0 w-full border-0 border-b border-border-1 bg-transparent"
        />

        <!-- Use already uploaded -->
        <div class="flex flex-col gap-sm p-sm">
          <div class="font-semibold tracking-tight">Файл уже загружен</div>

          <Button variant="primary" disabled class="font-semibold">
            <span>Использовать имеющийся</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </div>

        <hr
          class="h-0 w-full border-0 border-b border-border-1 bg-transparent"
        />

        <!-- Convert and upload -->
        <div class="flex flex-col gap-sm p-sm">
          <div class="font-semibold tracking-tight">Изменить файл</div>

          <FieldSlider
            v-model="quality"
            :values="new Array(91).fill(0).map((_, i) => 10 + i)"
            :format="(v) => `${v} %`"
            class="-mt-3"
          >
            <template #before>
              <div
                class="relative -top-3 text-sm leading-0 tracking-tight
                  text-text-2"
              >
                Качество
              </div>
            </template>
          </FieldSlider>

          <!-- TODO: Выставлять их по умолчанию, показывать кнопку только тогда, когда есть изменения -->
          <Button variant="secondary">
            <Icon name="check-shield" class="mr-xs" />
            <span>Рекомендуемые настройки</span>
          </Button>

          <Button variant="secondary">
            <Icon name="eye-open" class="mr-xs" />
            <span>Применить настройки</span>
          </Button>

          <Button variant="primary" disabled class="font-semibold">
            <span>Использовать измененный</span>
            <Icon name="chevron-right" class="ml-xs" />
          </Button>
        </div>
      </div>
    </template>
  </AssetModal>
</template>
