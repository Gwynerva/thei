<script lang="ts" setup>
import type { PublicContentOutputData } from '#layers/thei/shared/content';
import { buildContentHeadings } from '#layers/thei/app/components/content/content-headings';
import type { PublicDetailPanelData } from './public-detail';
import { publicDetailSheetModal } from '#layers/thei/app/modals/public-detail-sheet/modal';

const props = defineProps<{
  details: PublicDetailPanelData;
  content?: PublicContentOutputData;
}>();
const panelData = computed<PublicDetailPanelData>(() => ({
  ...props.details,
  contents: props.content
    ? buildContentHeadings(props.content, language.value.slugify)
    : props.details.contents,
}));
const publicHeader = useStickyHeaderContext();
const isAdmin = useIsAdmin();
const adminOffset = computed(() =>
  isAdmin.value ? 'var(--height-admin-bar)' : '0px',
);
const publicHeaderOffset = computed(
  () => `${publicHeader?.height.value ?? 0}px`,
);
const stickyAsideStyle = computed(() => ({
  top: `calc(${adminOffset.value} + ${publicHeaderOffset.value} + var(--spacing-sm))`,
}));
const stickyContentStyle = computed(() => ({
  maxHeight: `calc(100dvh - ${adminOffset.value} - ${publicHeaderOffset.value} - var(--spacing-md))`,
}));

function openDetails() {
  void openModal(publicDetailSheetModal, panelData.value);
}
</script>

<template>
  <button
    type="button"
    class="fixed right-window bottom-sm left-window z-40 flex cursor-pointer
      items-center gap-sm rounded-normal border border-border-1 bg-bg-1/70 px-sm
      py-xs text-left shadow-lg backdrop-blur-md transition focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none sm:hidden
      hocus:bg-bg-1/85"
    @click="openDetails"
  >
    <span class="flex min-w-0 flex-1 items-center gap-1 font-semibold">
      <span>{{ phrase.public_details_overview }}</span>
      <Icon name="expand-diagonal" class="text-text-3" />
    </span>
    <span class="flex flex-wrap justify-end gap-xs text-xs text-text-3">
      <span
        v-for="metric in panelData.metrics"
        :key="`${metric.icon}:${metric.label}`"
        class="inline-flex items-center gap-1 whitespace-nowrap"
        :data-title-popup="metric.label"
      >
        <Icon :name="metric.icon" />
        <span class="tabular-nums">{{ metric.value }}</span>
      </span>
    </span>
  </button>
  <div
    class="grid min-w-0 items-start gap-md pb-14
      sm:grid-cols-[minmax(0,50rem)_minmax(16rem,17rem)] sm:justify-between
      sm:gap-lg sm:pb-0"
  >
    <div class="max-w-200 min-w-0">
      <slot></slot>
    </div>
    <aside
      class="sticky hidden min-w-0 self-start sm:block"
      :style="stickyAsideStyle"
    >
      <div
        class="scrollbar-mini w-full min-w-0 overflow-x-clip overflow-y-auto
          overscroll-contain"
        :style="stickyContentStyle"
      >
        <PublicDetailPanel :data="panelData" />
      </div>
    </aside>
  </div>
</template>
