<script lang="ts" setup>
import type { PublicFile } from '#layers/thei/shared/api/public';
import { publicAssetModal } from '#layers/thei/app/modals/public-asset/modal';

withDefaults(defineProps<{ files: PublicFile[]; compact?: boolean }>(), {
  compact: false,
});
</script>

<template>
  <div
    v-if="files.length"
    class="grid gap-xs"
    :class="{ 'sm:grid-cols-2': !compact }"
  >
    <PublicCompactResourceItem
      v-for="file in files"
      :key="file.key"
      :title="file.title"
      :description="file.description"
      :icon-media="file.media"
      :extension="file.media ? undefined : file.extension"
      :icon="file.media ? 'media' : 'file'"
      button
      @activate="openModal(publicAssetModal, file)"
    />
  </div>
</template>
