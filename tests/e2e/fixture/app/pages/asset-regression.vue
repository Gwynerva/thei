<script setup lang="ts">
import {
  launchAssetWizard,
  launchAssetBatchWizard,
} from '#layers/thei/app/composables/asset-wizard';
import AssetPendingTile from '#layers/thei/app/components/AssetPendingTile.vue';
import type { PendingUpload } from '#layers/thei/app/composables/pending-upload';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
const selected = ref<AssetVariantInfo[]>([]);
/** Files still going up after a batch pick, each a tile of its own. */
const pending = shallowRef<PendingUpload[]>([]);
const error = ref('');
const ready = ref(false);
const picking = ref(false);
onMounted(() => {
  ready.value = true;
});
function forget(upload: PendingUpload) {
  pending.value = pending.value.filter((other) => other !== upload);
  upload.dispose();
}
async function pick(
  multiple = false,
  constrained = false,
  uploadProfile?: AssetUploadProfile,
) {
  picking.value = true;
  try {
    const options = constrained
      ? { acceptedExtensions: ['thei-never'], maxSize: 50 }
      : uploadProfile
        ? { uploadProfile }
        : {};
    if (multiple) {
      const result = await launchAssetBatchWizard(options);
      if (!result) return;
      selected.value = result.assets;
      pending.value = [...pending.value, ...result.uploads];
      for (const upload of result.uploads) {
        void upload.result.then((asset) => {
          if (!pending.value.includes(upload)) return;
          forget(upload);
          if (asset) selected.value = [...selected.value, asset];
        });
      }
    } else {
      const result = await launchAssetWizard(options);
      if (result) selected.value = [result];
    }
  } catch (e) {
    error.value = String(e);
  } finally {
    picking.value = false;
  }
}
</script>
<template>
  <main
    class="p-md"
    :data-ready="ready"
    :data-picking="picking"
    :data-pending="pending.length"
  >
    <button data-pick @click="pick()">Pick asset</button
    ><button data-batch class="m-sm" @click="pick(true)">Pick batch</button
    ><button data-constrained @click="pick(false, true)">Constrained</button
    ><button
      data-banner
      class="m-sm"
      @click="pick(false, false, 'project-banner')"
    >
      Banner
    </button>
    <div class="flex flex-wrap gap-sm p-sm">
      <AssetPendingTile
        v-for="upload in pending"
        :key="upload.id"
        :upload
        class="size-18"
        @cancel="forget(upload)"
        @retry="upload.retry()"
      />
    </div>
    <pre data-result>{{
      JSON.stringify(
        selected.map((a) => ({
          assetUuid: a.assetUuid,
          familyUuid: a.familyUuid,
          size: a.size,
        })),
      )
    }}</pre>
    <p data-error>{{ error }}</p>
  </main>
</template>
