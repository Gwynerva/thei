<script lang="ts" setup>
import type { ModalFrame } from './types';
import AssetModal from './asset-modal/AssetModal.vue';
import ModalContainer from './ModalContainer.vue';
import ModalHeaderButton from './ModalHeaderButton.vue';
import ModalScreenBar from './ModalScreenBar.vue';
import ModalTitle from './ModalTitle.vue';
import ModalWaiting from './ModalWaiting.vue';

/**
 * A modal's frame, waiting: drawn the moment a modal opens, until its code
 * has loaded, and between two steps of a flow, until the next one is there.
 * It looks as the modal will — the same card, file window or screen, with its
 * title — so that what arrives only fills it in.
 *
 * A modal that loads what it shows draws it too, meanwhile, and puts what it
 * has to say — a failure, a retry — in the default slot: a card's body, a
 * file window's panel.
 */
defineProps<{
  frame?: ModalFrame;
  title?: string;
  /** A modal still loading closes; a wait between two steps has none to. */
  closable: boolean;
}>();
</script>

<template>
  <ModalContainer v-if="frame?.kind === 'card'" :class="frame.width">
    <template #header>
      <div class="flex items-center gap-sm p-sm">
        <ModalTitle :icon="frame.icon" :title="title ?? ''" class="flex-1" />
        <ModalHeaderButton
          v-if="closable"
          icon="close"
          :label="phrase.close_modal"
          @click="closeModal"
        />
        <!-- The row keeps the height its buttons will give it. -->
        <span v-else class="h-9" aria-hidden="true"></span>
      </div>
    </template>
    <slot>
      <ModalWaiting class="h-32" />
    </slot>
  </ModalContainer>

  <AssetModal
    v-else-if="frame?.kind === 'file'"
    :aside-title="title"
    :closable="closable"
  >
    <template #preview>
      <ModalWaiting v-if="!$slots.default" />
    </template>
    <template v-if="$slots.default" #aside>
      <slot></slot>
    </template>
  </AssetModal>

  <section
    v-else-if="frame?.kind === 'screen'"
    class="absolute flex h-dvh w-dvw flex-col bg-bg-1"
  >
    <header class="shrink-0 border-b border-border-1 bg-bg-2 p-sm sm:p-md">
      <ModalScreenBar
        :icon="frame.icon"
        :title="title ?? ''"
        :closable="closable"
        class="mx-auto w-full"
        :class="frame.width"
      />
    </header>
    <ModalWaiting class="min-h-0 flex-1" />
  </section>

  <div v-else class="absolute inset-0 flex items-center justify-center">
    <ModalWaiting />
  </div>
</template>
