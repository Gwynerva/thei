<script lang="ts" setup>
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';

const { anchor, label, visible, popupClass } = useTitlePopup();

const floatingEl = ref<HTMLElement>();

const teleportTarget = computed<string | HTMLElement>(
  () => anchor.value?.closest('dialog') ?? 'body',
);

const { floatingStyles } = useFloating(anchor, floatingEl, {
  placement: 'bottom',
  middleware: [offset(6), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});
</script>

<template>
  <Teleport :to="teleportTarget">
    <TransitionFade>
      <div
        v-if="visible && label"
        ref="floatingEl"
        data-title-popup-el
        :style="floatingStyles"
        :class="popupClass || undefined"
        class="pointer-events-none fixed z-9999 max-w-[300px] rounded
          bg-bw-reverse px-2 py-1 text-xs font-normal text-bw shadow-md"
      >
        {{ label }}
      </div>
    </TransitionFade>
  </Teleport>
</template>
