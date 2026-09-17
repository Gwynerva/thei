<script lang="ts" setup>
import type { VNodeChild } from 'vue';
import type { IconName } from '#thei/icons';

export interface PublicMobileSheetData {
  title: () => string;
  icon: () => IconName | undefined;
  /** Slot renderers of the page that opened the sheet, so content stays live. */
  summary: () => unknown;
  content: (close: () => Promise<boolean>) => unknown;
}

const props = defineProps<{ modalData: PublicMobileSheetData }>();
const root = useTemplateRef<HTMLElement>('root');
const sheetModal = activeModal.value;
const shown = ref(true);
const reducedMotion = ref(false);
let finishLeave: (() => void) | undefined;

const Summary = () => props.modalData.summary() as VNodeChild;
const Content = () => props.modalData.content(closeModalAndWait) as VNodeChild;

useModalLeaveTransition(
  () =>
    new Promise<void>((resolve) => {
      finishLeave = resolve;
      shown.value = false;
    }),
);

function afterLeave() {
  finishLeave?.();
  finishLeave = undefined;
}

function closeIfDesktop() {
  if (
    activeModal.value === sheetModal &&
    root.value &&
    getComputedStyle(root.value).display === 'none'
  )
    closeModal();
}

// An inactive sheet is hidden by the modal stack even on mobile.
// Check again when returning from a nested file viewer after a resize.
watch(activeModal, closeIfDesktop, { flush: 'post' });

onMounted(() => {
  reducedMotion.value = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  window.addEventListener('resize', closeIfDesktop, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', closeIfDesktop);
  afterLeave();
});
</script>

<template>
  <Transition
    appear
    name="mobile-sheet"
    :duration="reducedMotion ? 0 : 250"
    @after-leave="afterLeave"
  >
    <section
      v-if="shown"
      ref="root"
      class="absolute inset-0 flex items-end sm:hidden"
    >
      <button
        type="button"
        class="sheet-backdrop absolute inset-0 cursor-default bg-bg-1/55
          backdrop-blur-sm"
        :aria-label="phrase.close_modal"
        @click="closeModal"
      ></button>
      <PublicSheetFrame expanded class="relative max-h-[90dvh] w-full">
        <PublicSheetHeader
          :title="modalData.title()"
          :icon="modalData.icon()"
          expanded
          class="shrink-0"
          @toggle="closeModal"
        >
          <template #summary><Summary /></template>
        </PublicSheetHeader>
        <div class="sheet-body min-h-0">
          <div
            class="scrollbar-hover min-h-0 overflow-x-clip overflow-y-auto
              overscroll-contain"
          >
            <Content />
          </div>
        </div>
      </PublicSheetFrame>
    </section>
  </Transition>
</template>

<style scoped>
.sheet-body {
  display: grid;
  grid-template-rows: 1fr;
  overflow: hidden;
}
.sheet-backdrop {
  transition: opacity 0.25s ease-out;
}
.mobile-sheet-enter-from .sheet-backdrop,
.mobile-sheet-leave-to .sheet-backdrop,
.mobile-sheet-enter-from :deep(.public-sheet-glow),
.mobile-sheet-leave-to :deep(.public-sheet-glow) {
  opacity: 0;
}
@supports not (interpolate-size: allow-keywords) {
  .sheet-body {
    transition: grid-template-rows 0.25s ease-out;
  }
  .mobile-sheet-enter-from .sheet-body,
  .mobile-sheet-leave-to .sheet-body {
    grid-template-rows: 0fr;
  }
}
@supports (interpolate-size: allow-keywords) {
  .sheet-body {
    interpolate-size: allow-keywords;
    height: auto;
    transition: height 0.25s ease-out;
  }
  .mobile-sheet-enter-from .sheet-body,
  .mobile-sheet-leave-to .sheet-body {
    height: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet-body,
  .sheet-backdrop {
    transition: none;
  }
}
</style>
