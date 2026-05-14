<script lang="ts" setup>
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';

const { anchor, label, visible, popupClass } = useTitlePopup();

const floatingEl = ref<HTMLElement>();

const { floatingStyles } = useFloating(anchor, floatingEl, {
  placement: 'bottom',
  middleware: [offset(6), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});
</script>

<template>
  <Teleport to="body">
    <TransitionFade>
      <div
        v-if="visible && label"
        ref="floatingEl"
        thei-title-popup-el
        :style="floatingStyles"
        :class="popupClass || undefined"
        class="pointer-events-none fixed z-9999 rounded bg-gray-900/90 px-2 py-1
          text-xs font-medium whitespace-nowrap text-gray-100 shadow-md
          dark:bg-white/90 dark:text-gray-900"
      >
        {{ label }}
      </div>
    </TransitionFade>
  </Teleport>
</template>
