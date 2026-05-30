<script lang="ts" setup>
import { pickTestModal } from '#layers/thei/app/modals/pick-test/modal';
import {
  anyFileExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import { pickFileModal } from '../modals/pick-file/modal';

definePageMeta({
  layout: 'public',
});

function click() {
  //const { cycleTheme } = useTheme();
  //cycleTheme();
}

const lastResult = ref<string>('—');

async function openTestModal() {
  const result = await openModal(pickTestModal, {
    label: 'Pick a number',
    min: 0,
    max: 100,
  });
  lastResult.value = JSON.stringify(result);
}

async function openPickFileModal() {
  await openModal(pickFileModal, {
    accept: [videoExtensionProfile, imageExtensionProfile, 'txt'],
    maxSize: 10 * 1024 * 1024,
  });
}

openPickFileModal();
</script>

<template>
  <h1 class="text-amber-700 text-4xl font-bold">Test</h1>
  <p>I waited you!</p>
  <button @click="click">Cycle theme</button>
  <button @click="openTestModal">Open test modal</button>
  <p>Last result: {{ lastResult }}</p>
  <button @click="openPickFileModal">Open pick file modal</button>
  <div class="h-[2000px]"></div>
</template>
