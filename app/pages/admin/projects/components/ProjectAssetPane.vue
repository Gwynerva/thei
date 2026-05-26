<script lang="ts" setup>
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import AssetUploadPane from '#layers/thei/app/components/AssetUploadPane.vue';

const props = defineProps<{
  previewUrl: string;
  profileId: AssetProfileId;
}>();

const emit = defineEmits<{
  uploaded: [result: AssetUploadResponse];
  deleted: [];
}>();

const modal = useModal();

const imageClass = computed(() =>
  props.profileId === 'banner' ? 'aspect-video w-full' : 'size-32',
);

function onEdit() {
  modal.push({
    title: ASSET_PROFILES[props.profileId].label,
    component: AssetUploadPane,
    props: { profileId: props.profileId },
    onBack: (result) => {
      if (result) {
        emit('uploaded', result as AssetUploadResponse);
        modal.close();
      }
    },
  });
}

function onDelete() {
  emit('deleted');
  modal.close();
}
</script>

<template>
  <div class="flex flex-col gap-md">
    <img
      :src="previewUrl"
      :class="imageClass"
      class="m-auto rounded-normal object-cover shadow-md shadow-shadow-1"
      :alt="ASSET_PROFILES[profileId].label"
    />
    <div class="flex flex-wrap items-center gap-sm">
      <Button variant="secondary" class="flex-1" @click="onEdit">
        <Icon name="edit" class="mr-xs" />
        {{ phrase.edit }}
      </Button>
      <Button variant="delete" class="flex-1" @click="onDelete">
        <Icon name="delete" class="mr-xs" />
        {{ phrase.delete }}
      </Button>
    </div>
  </div>
</template>
