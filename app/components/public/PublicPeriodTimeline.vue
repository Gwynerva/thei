<script lang="ts" setup>
import type { DateRange } from '#layers/thei/shared/date-range';
import { buildLifeUrl } from '#layers/thei/shared/life';
import {
  publicTimelineGapDuration,
  publicTimelineHasGap,
  publicTimelineIsDay,
  publicTimelinePeriodDuration,
  sortPublicTimelineItemsNewestFirst,
} from '#layers/thei/shared/public-timeline';
import { formatAbsolutePublicDate } from '#layers/thei/app/composables/public-date';

const props = defineProps<{ periods: DateRange[] }>();
const orderedPeriods = computed(() =>
  sortPublicTimelineItemsNewestFirst(props.periods, (period) => period),
);

function gapDuration(index: number) {
  const newer = orderedPeriods.value[index - 1];
  const older = orderedPeriods.value[index];
  if (!newer || !older) return { years: 0, months: 0, days: 0 };
  return publicTimelineGapDuration(newer, older);
}

function formatDate(value: string) {
  return formatAbsolutePublicDate(value, language.value.code);
}

function periodDurationLabel(period: DateRange) {
  const duration = publicTimelinePeriodDuration(period);
  return phrase.value.public_timeline_duration(
    duration.years,
    duration.months,
    duration.days,
  );
}
</script>

<template>
  <ol v-if="orderedPeriods.length" class="relative flex flex-col">
    <template
      v-for="(period, index) in orderedPeriods"
      :key="`${period.startDate}:${period.endDate}`"
    >
      <li v-if="index">
        <PublicTimelineGap
          v-if="publicTimelineHasGap(gapDuration(index))"
          :duration="gapDuration(index)"
          compact
        />
        <div
          v-else
          class="grid h-xs grid-cols-[1.75rem_minmax(0,1fr)] gap-xs"
          aria-hidden="true"
        >
          <span class="flex justify-center">
            <span class="h-full w-0.5 bg-accent/80"></span>
          </span>
        </div>
      </li>
      <li
        class="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center
          gap-xs"
      >
        <span
          class="flex size-5 items-center justify-center justify-self-center
            rounded-full bg-accent ring-2 ring-bg-1"
          aria-hidden="true"
        >
          <span
            v-if="publicTimelineIsDay(period)"
            class="size-2 rounded-full bg-white"
          ></span>
          <span
            v-else
            class="h-2.5 w-3 rotate-180 bg-white
              [clip-path:polygon(50%_0,100%_100%,0_100%)]"
          ></span>
        </span>
        <TheiLink
          :to="buildLifeUrl(period.endDate)"
          class="min-w-0 rounded-xs leading-tight text-text-1 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none hocus:text-accent"
        >
          <time :datetime="period.endDate" class="block text-sm">
            <template v-if="publicTimelineIsDay(period)">
              {{ formatDate(period.endDate) }}
            </template>
            <template v-else>
              {{ phrase.public_timeline_until(formatDate(period.endDate)) }}
            </template>
          </time>
        </TheiLink>
      </li>
      <li
        v-if="!publicTimelineIsDay(period)"
        class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-xs"
      >
        <span class="flex justify-center" aria-hidden="true">
          <span class="h-full w-1 rounded-full bg-accent"></span>
        </span>
        <span class="py-xs text-xs leading-relaxed text-text-3 italic">
          {{ periodDurationLabel(period) }}
        </span>
      </li>
      <li
        v-if="!publicTimelineIsDay(period)"
        class="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center
          gap-xs"
      >
        <span
          class="flex size-5 items-center justify-center justify-self-center
            rounded-full bg-accent ring-2 ring-bg-1"
          aria-hidden="true"
        >
          <span
            class="h-2.5 w-3 bg-white
              [clip-path:polygon(50%_0,100%_100%,0_100%)]"
          ></span>
        </span>
        <TheiLink
          :to="buildLifeUrl(period.endDate)"
          class="min-w-0 rounded-xs leading-tight text-text-1 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none hocus:text-accent"
        >
          <time :datetime="period.startDate" class="block text-sm">
            {{ phrase.public_timeline_from(formatDate(period.startDate)) }}
          </time>
        </TheiLink>
      </li>
    </template>
  </ol>
</template>
