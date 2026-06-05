<script lang="ts" setup>
import { anyFileExtensionProfile } from '#layers/thei/shared/assets/extensions';
import { editFileModal } from '../modals/upload-settings/modal';
import { pickFileModal } from '../modals/pick-file/modal';
import type { PickedFile } from '../modals/pick-file/picked-file';

definePageMeta({
  layout: 'public',
});

function click() {
  //const { cycleTheme } = useTheme();
  //cycleTheme();
}

onMounted(async () => {
  launchAssetWizard();
});

async function launchAssetWizard() {
  let step: 'pick' | 'edit' = 'pick';
  let pickedFile: PickedFile | undefined;

  function beforeClose() {
    if (pickedFile) {
      URL.revokeObjectURL(pickedFile.objectUrl);
    }
  }

  while (true) {
    if (step === 'pick') {
      // Clear previous before picking new file
      if (pickedFile) {
        URL.revokeObjectURL(pickedFile.objectUrl);
      }

      // Preload the upload-settings bundle in the background so it is already
      // cached by the time the user picks a file and openModal() needs it.
      editFileModal.component();

      const modalResult = await openModal(pickFileModal, {
        accept: anyFileExtensionProfile,
        maxSize: 10 * 1024 * 1024,
      });

      if (modalResult.type === 'picked-file') {
        pickedFile = modalResult;

        step = 'edit';
        // Make other state variables undefined
        continue;
      }

      beforeClose();
      return;
    }

    if (step === 'edit') {
      const modalResult = await openModal(editFileModal, {
        file: pickedFile!,
      });

      if (modalResult.type === 'upload-new') {
        step = 'pick';
        continue;
      }

      beforeClose();
      return;
    }
  }
}
</script>

<template>
  <h1 class="text-amber-700 text-4xl font-bold">Test</h1>
  <p>I waited you!</p>
  <button @click="click">Cycle theme</button>
  <button @click="launchAssetWizard">Launch Asset Wizard</button>
  <div class="h-[2000px]"></div>
</template>
