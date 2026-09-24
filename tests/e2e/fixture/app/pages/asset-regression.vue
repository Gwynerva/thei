<script setup lang="ts">
import {
  launchAssetWizard,
  launchAssetBatchWizard,
} from '#layers/thei/app/composables/asset-wizard';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
const selected = ref<AssetVariantInfo[]>([]);
const error = ref('');
const ready = ref(false);
const picking = ref(false);
onMounted(() => {
  ready.value = true;
});
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
      if (result) selected.value = result.assets;
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
  <main class="p-md" :data-ready="ready" :data-picking="picking">
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
