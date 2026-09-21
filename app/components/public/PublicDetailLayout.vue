<script lang="ts" setup>
import type { PublicContentOutputData } from '#layers/thei/shared/content';
import {
  buildContentHeadings,
  type ContentHeading,
} from '#layers/thei/app/components/content/content-headings';
import {
  useSheetContentNavigation,
  type PublicDetailPanelData,
} from './public-detail';

const props = defineProps<{
  details: PublicDetailPanelData;
  content?: PublicContentOutputData;
  /** Sections of the page that are not part of the authored content. */
  extraContents?: ContentHeading[];
}>();
const panelData = computed<PublicDetailPanelData>(() => ({
  ...props.details,
  contents: [
    ...(props.content
      ? buildContentHeadings(props.content, language.value.slugify)
      : (props.details.contents ?? [])),
    ...(props.extraContents ?? []),
  ],
}));
const navigateFromSheet = useSheetContentNavigation();
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
</script>

<template>
  <PublicSheet :title="phrase.public_details_overview">
    <template #summary><PublicDetailMetrics :data="panelData" /></template>
    <template #default="{ close }">
      <PublicDetailPanel
        :data="panelData"
        @navigate="(id, event) => navigateFromSheet(id, event, close)"
      />
    </template>
  </PublicSheet>
  <div
    class="grid min-w-0 items-start gap-md
      pb-[calc(4.5rem+env(safe-area-inset-bottom))]
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
        class="scrollbar-hover w-full min-w-0 overflow-x-clip overflow-y-auto
          overscroll-contain"
        :style="stickyContentStyle"
      >
        <PublicDetailPanel :data="panelData" />
      </div>
    </aside>
  </div>
</template>
