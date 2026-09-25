<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import { publicMobileSheetModal } from '#layers/thei/app/modals/public-mobile-sheet/modal';

/**
 * The mobile form of a side panel: a bar pinned to the bottom that expands
 * into a sheet. The slots are rendered by the sheet as well, so its content
 * stays live while it is open.
 */
const props = defineProps<{ title: string; icon?: IconName }>();
const emit = defineEmits<{ open: []; close: [] }>();
const slots = defineSlots<{
  summary?: () => unknown;
  default: () => unknown;
}>();

async function open() {
  emit('open');
  await openModal(publicMobileSheetModal, {
    title: () => props.title,
    icon: () => props.icon,
    summary: () => slots.summary?.(),
    content: () => slots.default(),
  });
  await modalHistorySettled();
  emit('close');
}
</script>

<template>
  <PublicSheetFrame class="fixed inset-x-0 bottom-0 z-40 sm:hidden">
    <PublicSheetHeader :title :icon @toggle="open">
      <template v-if="$slots.summary" #summary
        ><slot name="summary"
      /></template>
    </PublicSheetHeader>
  </PublicSheetFrame>
</template>
