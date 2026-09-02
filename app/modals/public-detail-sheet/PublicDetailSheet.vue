<script lang="ts" setup>
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';

defineProps<{ modalData: PublicDetailPanelData }>();
const root = useTemplateRef<HTMLElement>('root');

function closeIfDesktop() {
  if (root.value && getComputedStyle(root.value).display === 'none')
    closeModal();
}

async function navigateToContent(id: string, event: MouseEvent) {
  event.preventDefault();
  const historySettled = history.state?.__theiModal
    ? new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      )
    : Promise.resolve();
  closeModal();
  await historySettled;
  await nextTick();
  const target = document.getElementById(id);
  if (!target) return;
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}#${id}`,
  );
  target.scrollIntoView();
}

onMounted(() =>
  window.addEventListener('resize', closeIfDesktop, { passive: true }),
);
onBeforeUnmount(() => window.removeEventListener('resize', closeIfDesktop));
</script>

<template>
  <section ref="root" class="absolute inset-0 flex items-end sm:hidden">
    <button
      type="button"
      class="absolute inset-0 cursor-default bg-bg-1/55 backdrop-blur-sm"
      :aria-label="phrase.close_modal"
      @click="closeModal"
    ></button>
    <div
      class="relative flex h-[90dvh] w-full min-w-0 flex-col overflow-hidden
        rounded-t-normal border border-b-0 border-border-1 bg-bg-2 shadow-xl"
    >
      <header
        class="flex shrink-0 items-center gap-xs border-b border-border-1
          bg-bg-2/80 p-sm backdrop-blur-md"
      >
        <h2 class="min-w-0 flex-1 truncate font-semibold">
          {{ phrase.public_details_overview }}
        </h2>
        <button
          type="button"
          autofocus
          class="flex size-9 cursor-pointer items-center justify-center
            rounded-sm bg-bg-3 text-text-2 transition focus-visible:ring-2
            focus-visible:ring-accent focus-visible:outline-none hocus:bg-bg-4
            hocus:text-text-1"
          :aria-label="phrase.close_modal"
          @click="closeModal"
        >
          <Icon name="close" />
        </button>
      </header>
      <div
        class="scrollbar-mini min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <PublicDetailPanel :data="modalData" @navigate="navigateToContent" />
      </div>
    </div>
  </section>
</template>
