<script lang="ts" setup>
import {
  anyFileExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import { editFileModal } from '../modals/edit-file/modal';
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
  openModal(editFileModal, {
    file: {
      name: 'test.png',
      extension: 'mp4',
      objectUrl:
        'https://ru.omath.net/file/content/01-foundations/02-equations/01-elementary/assets/explaining-meme.mp4',
      size: 10 * 1024,
    },
  });

  //launchAssetWizard();
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
      console.log('edit');
      const modalResult = await openModal(editFileModal, {
        file: pickedFile!,
      });

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
