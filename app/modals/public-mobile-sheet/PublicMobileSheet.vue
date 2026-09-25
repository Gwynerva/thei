<script lang="ts" setup>
import type { VNodeChild } from 'vue';
import type { IconName } from '#thei/icons';

export interface PublicMobileSheetData {
  title: () => string;
  icon: () => IconName | undefined;
  /** Slot renderers of the page that opened the sheet, so content stays live. */
  summary: () => unknown;
  content: () => unknown;
}

const props = defineProps<{ modalData: PublicMobileSheetData }>();
const router = useRouter();
const site = useSiteUrl();
const root = useTemplateRef<HTMLElement>('root');
const sheetModal = activeModal.value;
const shown = ref(true);
const reducedMotion = ref(false);
let finishLeave: (() => void) | undefined;

const Summary = () => props.modalData.summary() as VNodeChild;
const Content = () => props.modalData.content() as VNodeChild;

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

/**
 * Links in the sheet lead out of it. While a modal is open the router turns
 * every navigation into closing that modal, so a link here closes the sheet
 * itself and then goes where it points, once the sheet has let go of history.
 *
 * A place on this very page is scrolled to straight away and the sheet closes
 * over it: waiting for the sheet to slide away first only meant staring at a
 * page that had not moved yet. The address catches up afterwards.
 */
async function followLink(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = (event.target as Element).closest('a[href]');
  if (
    !(link instanceof HTMLAnchorElement) ||
    (link.target && link.target !== '_self') ||
    link.hasAttribute('download')
  )
    return;
  const url = new URL(link.href);
  if (url.origin !== window.location.origin) return;
  const target = router.resolve(
    site.strip(url.pathname) + url.search + url.hash,
  );
  // Whatever the router does not know stays an ordinary page load.
  if (!target.matched.length) return;
  event.preventDefault();
  event.stopPropagation();
  const current = router.currentRoute.value;
  const page = (route: { fullPath: string }) =>
    route.fullPath.replace(/#.*$/, '');
  const samePage = page(target) === page(current);
  const anchor =
    samePage && target.hash
      ? document.getElementById(target.hash.slice(1))
      : null;
  anchor?.scrollIntoView();
  await closeModalAndWait();
  // Closing puts the page back where the sheet found it; take it back before
  // the next frame, so the jump is never seen.
  anchor?.scrollIntoView();
  await modalHistorySettled();
  // A string, not the resolved route: rebuilt from its name, the route would
  // lose the trailing slash and bounce off the canonical redirect.
  if (!samePage) await router.push(target.fullPath);
  else if (current.hash !== target.hash) await router.replace(target.fullPath);
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
            @click.capture="followLink"
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
