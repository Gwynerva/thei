<script lang="ts" setup>
import {
  sortPublicDetailTimelineItems,
  type PublicDetailTimelineItem,
} from './public-detail';
import { getPublicDatePresentation } from '#layers/thei/app/composables/public-date';

const props = defineProps<{ items: PublicDetailTimelineItem[] }>();
const liveNow = useLiveNow();
const orderedItems = computed(() =>
  sortPublicDetailTimelineItems(props.items).map((item) => ({
    ...item,
    presentation: getPublicDatePresentation(
      item.date,
      language.value.code,
      new Date(liveNow.value),
      { relativeMonths: 3 },
    ),
  })),
);
</script>

<template>
  <ol v-if="orderedItems.length" class="relative flex flex-col">
    <li
      v-for="(item, index) in orderedItems"
      :key="`${item.label}:${item.date}`"
      class="relative grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-xs
        pb-sm last:pb-0"
    >
      <span
        v-if="index < orderedItems.length - 1"
        class="absolute top-7 bottom-0 left-3.5 w-0.5 -translate-x-1/2
          bg-accent/28"
        aria-hidden="true"
      ></span>
      <span
        class="relative flex size-7 shrink-0 items-center justify-center
          rounded-full bg-bg-3 text-sm text-accent ring-2 ring-bg-1"
        aria-hidden="true"
      >
        <Icon :name="item.icon" />
      </span>
      <span class="min-w-0 pt-0.5">
        <span class="block text-sm leading-tight text-text-1">
          {{ item.label }}
        </span>
        <time
          :datetime="item.date"
          :data-title-popup="item.presentation.title"
          class="mt-1 block text-xs leading-none text-text-3"
        >
          {{ item.presentation.label }}
        </time>
      </span>
    </li>
  </ol>
</template>
