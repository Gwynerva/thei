<script setup lang="ts">
import FilePreview from '../../components/FilePreview.vue';
import AssetModal from './AssetModal.vue';
</script>

<template>
  <AssetModal>
    <template #preview>
      <FilePreview
        icon="lock-close"
        class="w-1/2 max-w-132 text-text-warning"
      />
    </template>
    <template #aside>
      <div
        class="flex h-full w-full flex-col items-center justify-center gap-md
          p-md text-center text-text-warning"
      >
        <Icon name="lock-close" class="text-3xl" />
        <div class="font-semibold">
          {{ phrase.only_site_owner_has_access_to_asset }}
        </div>
      </div>
    </template>
  </AssetModal>
</template>
