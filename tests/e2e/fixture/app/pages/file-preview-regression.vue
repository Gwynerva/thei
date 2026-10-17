<script setup lang="ts">
import FilePreviewContent from '#layers/thei/app/components/file-preview/FilePreviewContent.vue';
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';

/**
 * A file's view on its own, as the file window holds it: `src`, `extension`
 * and `size` from the address, `archived` as `extension:size` for a file
 * kept zipped. With `window` it is in the window itself, with its buttons.
 */
const route = useRoute();
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const archived = computed(() => {
  const [extension, size] = text(route.query.archived).split(':');
  return extension ? { extension, size: Number(size) } : undefined;
});
</script>

<template>
  <AssetModal v-if="route.query.window" aside-title="Fixture file">
    <template #preview>
      <FilePreviewContent
        :src="text(route.query.src)"
        :extension="text(route.query.extension)"
        :size="Number(route.query.size)"
        :archived-original="archived"
        title="Fixture file"
      />
    </template>
  </AssetModal>
  <main
    v-else
    class="relative flex items-center justify-center bg-bg-1"
    style="height: 640px"
    data-file-preview-fixture
  >
    <FilePreviewContent
      :src="text(route.query.src)"
      :extension="text(route.query.extension)"
      :size="Number(route.query.size)"
      :archived-original="archived"
      title="Fixture file"
    />
  </main>
</template>
