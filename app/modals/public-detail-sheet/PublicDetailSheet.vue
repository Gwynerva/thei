<script lang="ts" setup>
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';

defineProps<{ modalData: PublicDetailPanelData }>();
const root = useTemplateRef<HTMLElement>('root');
const sheetModal = activeModal.value;
const shown = ref(true);
const reducedMotion = ref(false);
let finishLeave: (() => void) | undefined;

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

async function navigateToContent(id: string, event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const historySettled = history.state?.__theiModal
    ? new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      )
    : Promise.resolve();
  await closeModalAndWait();
  await historySettled;
  const target = document.getElementById(id);
  if (!target) return;
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${location.search}#${id}`,
  );
  target.scrollIntoView();
}

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
    name="detail-sheet"
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
      <div
        class="relative flex max-h-[90dvh] w-full min-w-0 flex-col
          overflow-hidden rounded-t-normal border border-b-0 border-border-1
          bg-bg-1/85 pb-[env(safe-area-inset-bottom)] shadow-lg
          backdrop-blur-md"
      >
        <PublicDetailSheetHeader
          :data="modalData"
          expanded
          class="shrink-0"
          @toggle="closeModal"
        />
        <div class="sheet-body min-h-0">
          <div
            class="scrollbar-hover min-h-0 overflow-x-clip overflow-y-auto
              overscroll-contain"
          >
            <PublicDetailPanel
              :data="modalData"
              @navigate="navigateToContent"
            />
          </div>
        </div>
      </div>
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
.detail-sheet-enter-from .sheet-backdrop,
.detail-sheet-leave-to .sheet-backdrop {
  opacity: 0;
}
@supports not (interpolate-size: allow-keywords) {
  .sheet-body {
    transition: grid-template-rows 0.25s ease-out;
  }
  .detail-sheet-enter-from .sheet-body,
  .detail-sheet-leave-to .sheet-body {
    grid-template-rows: 0fr;
  }
}
@supports (interpolate-size: allow-keywords) {
  .sheet-body {
    interpolate-size: allow-keywords;
    height: auto;
    transition: height 0.25s ease-out;
  }
  .detail-sheet-enter-from .sheet-body,
  .detail-sheet-leave-to .sheet-body {
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
