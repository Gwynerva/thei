<script lang="ts" setup>
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  datePrecisionTone,
  isApproximateDate,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import type { Period } from '#layers/thei/shared/period';
import { buildLifeUrl } from '#layers/thei/shared/life';
import {
  publicTimelineGapBefore,
  publicTimelineHasGap,
  publicTimelineIsDay,
  publicTimelinePeriodDuration,
  sortPublicTimelineItemsNewestFirst,
} from '#layers/thei/shared/public-timeline';
import {
  approximateDateTitle,
  formatAbsolutePublicDate,
  publicDatePrecisionLabels,
} from '#layers/thei/app/composables/public-date';
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

type TimelinePeriod = DateRange | DatedPeriod | Period;

const props = defineProps<{ periods: TimelinePeriod[] }>();
const orderedPeriods = computed(() =>
  sortPublicTimelineItemsNewestFirst(props.periods, (period) => period),
);

function gapDuration(index: number) {
  return publicTimelineGapBefore(orderedPeriods.value, index);
}

/**
 * What the rail does under a period's last row, which a name makes taller
 * than its mark: nothing below the oldest one, the dots of the pause that
 * follows, or a line straight on to the next period.
 */
function tailAfter(index: number) {
  if (index >= orderedPeriods.value.length - 1) return 'none';
  return publicTimelineHasGap(gapDuration(index + 1)) ? 'dots' : 'line';
}

function labelOf(period: TimelinePeriod) {
  return 'label' in period ? period.label : '';
}

function formatDate(value: string) {
  return formatAbsolutePublicDate(value, language.value.code);
}

/**
 * A period the owner is unsure of carries the doubt on both of its ends, since
 * the whole stretch is a guess rather than one of its edges.
 */
function approximate(period: TimelinePeriod) {
  return 'precision' in period && isApproximateDate(period.precision);
}

function approximateClass(period: TimelinePeriod) {
  if (!approximate(period)) return '';
  const tone = datePrecisionTone((period as DatedPeriod).precision);
  return tone === 'alert'
    ? 'text-text-error'
    : tone === 'warning'
      ? 'text-text-warning'
      : '';
}

/**
 * A named period is read by its name, so its dates step back under it; a
 * doubt still colours them, whatever else they are. A date that is the whole
 * link lights up with it.
 */
function dateClass(period: TimelinePeriod, link = false) {
  const tone = approximateClass(period);
  if (!labelOf(period)) return ['text-sm leading-5', tone];
  if (tone) return ['text-xs', tone];
  return [
    'text-xs text-text-3',
    link ? 'transition group-hocus:text-accent' : '',
  ];
}

function approximateTitle(period: TimelinePeriod) {
  if (!approximate(period)) return undefined;
  const { precision, precisionNote } = period as DatedPeriod;
  return titlePopup(
    ...approximateDateTitle(
      precision,
      precisionNote,
      publicDatePrecisionLabels(),
      publicText,
    ),
  );
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
      :key="`${period.startDate}:${period.endDate}:${labelOf(period)}`"
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
      <li class="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-xs">
        <PublicPeriodRail
          :mark="publicTimelineIsDay(period) ? 'day' : 'end'"
          :tail="publicTimelineIsDay(period) ? tailAfter(index) : 'bar'"
        />
        <TheiLink
          :to="buildLifeUrl({ date: period.endDate })"
          class="group flex min-w-0 flex-col rounded-xs text-text-1 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none"
          :class="labelOf(period) ? '' : 'hocus:text-accent'"
        >
          <span
            v-if="labelOf(period)"
            class="text-sm leading-5 wrap-break-word transition
              group-hocus:text-accent"
          >
            {{ publicText(labelOf(period)) }}
          </span>
          <time
            :datetime="period.endDate"
            class="flex items-center gap-1"
            :class="dateClass(period)"
            v-bind="approximateTitle(period)"
          >
            <Icon v-if="approximate(period)" name="approximate" />
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
          <span class="h-full w-1 bg-accent"></span>
        </span>
        <span class="py-xs text-xs leading-relaxed text-text-3 italic">
          {{ periodDurationLabel(period) }}
        </span>
      </li>
      <li
        v-if="!publicTimelineIsDay(period)"
        class="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-xs"
      >
        <PublicPeriodRail mark="start" :tail="tailAfter(index)" />
        <!-- The start leads to the period's end as well: the life timeline
             folds a short period into one card on its last day, and a day
             before it may hold nothing of this period at all. -->
        <TheiLink
          :to="buildLifeUrl({ date: period.endDate })"
          class="group min-w-0 rounded-xs text-text-1 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none hocus:text-accent"
        >
          <time
            :datetime="period.startDate"
            class="flex items-center gap-1 leading-5"
            :class="dateClass(period, true)"
            v-bind="approximateTitle(period)"
          >
            <Icon v-if="approximate(period)" name="approximate" />
            {{ phrase.public_timeline_from(formatDate(period.startDate)) }}
          </time>
        </TheiLink>
      </li>
    </template>
  </ol>
</template>
