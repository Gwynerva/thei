<script lang="ts" setup>
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  datePrecisionTone,
  isApproximateDate,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import type { Period } from '#layers/thei/shared/period';
import { buildLifeUrl, lifeArrivalCutoff } from '#layers/thei/shared/life';
import {
  publicTimelineGapBefore,
  publicTimelineHasGap,
  publicTimelineIsDay,
  publicPeriodState,
  publicTimelinePeriodDuration,
  sortPublicTimelineItemsNewestFirst,
  type PublicPeriodMark,
} from '#layers/thei/shared/public-timeline';
import {
  approximateDateTitle,
  publicDatePrecisionLabels,
} from '#layers/thei/app/composables/public-date';
import {
  formatPublicDateAtPrecision,
  formatPublicPeriodAtPrecision,
} from '#layers/thei/shared/public-date-format';
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

type TimelinePeriod = DateRange | DatedPeriod | Period;

const props = defineProps<{ periods: TimelinePeriod[] }>();
const TheiLink = resolveComponent('TheiLink');
/**
 * The day the page is read on, as the server saw it when it drew the page:
 * the browser takes it from the payload, so a period ending around midnight
 * is drawn the same on both sides of hydration.
 */
const cutoff = useState('thei:arrival-cutoff', () => lifeArrivalCutoff());

function stateOf(period: TimelinePeriod) {
  return publicPeriodState(period, cutoff.value);
}

/**
 * The day of the life timeline a row leads to: its own end once it has come,
 * the start of a period still running — the only day of it the timeline
 * holds yet — and nothing at all for a period still to come.
 */
function linkedDay(period: TimelinePeriod, end: boolean) {
  const state = stateOf(period);
  if (state === 'upcoming') return undefined;
  if (!end) return period.startDate;
  return state === 'past' ? period.endDate : period.startDate;
}
const orderedPeriods = computed(() =>
  sortPublicTimelineItemsNewestFirst(props.periods, (period) => period),
);

/**
 * One row per mark, newest first: a period's end and its start, or its one
 * day. Beside each row the rail runs from its mark on to the next row's —
 * the period itself under an end, the dots of a pause or a line to the next
 * period under a start or a day, nothing under the oldest — and the words
 * that go with that stretch, its length or the pause, close the row.
 */
type TimelineRow = {
  key: string;
  period: TimelinePeriod;
  side: 'end' | 'start' | 'day';
  mark: PublicPeriodMark;
  tail: 'none' | 'line' | 'bar' | 'dots';
  /** What is said beside the stretch: the period's length, or the pause. */
  between?: string;
  /** A period yet to come, drawn quieter than the ones that happened. */
  muted: boolean;
};

const rows = computed(() =>
  orderedPeriods.value.flatMap((period, index): TimelineRow[] => {
    const key = `${period.startDate}:${period.endDate}:${labelOf(period)}`;
    const muted = stateOf(period) === 'upcoming';
    const below = stretchBelow(index);
    if (publicTimelineIsDay(period))
      return [{ key, period, side: 'day', mark: 'day', muted, ...below }];
    return [
      {
        key: `${key}:end`,
        period,
        side: 'end',
        mark: stateOf(period) === 'ongoing' ? 'ongoing' : 'end',
        muted,
        tail: 'bar',
        between: periodDurationLabel(period),
      },
      {
        key: `${key}:start`,
        period,
        side: 'start',
        mark: 'start',
        muted,
        ...below,
      },
    ];
  }),
);

/** The stretch of rail under a period's oldest row, on to the next period. */
function stretchBelow(index: number): Pick<TimelineRow, 'tail' | 'between'> {
  if (index >= orderedPeriods.value.length - 1) return { tail: 'none' };
  const gap = publicTimelineGapBefore(orderedPeriods.value, index + 1);
  if (!publicTimelineHasGap(gap)) return { tail: 'line' };
  return {
    tail: 'dots',
    between: phrase.value.life_gap(gap.years, gap.months, gap.days),
  };
}

function labelOf(period: TimelinePeriod) {
  return 'label' in period ? period.label : '';
}

function precisionOf(period: TimelinePeriod) {
  return 'precision' in period ? period.precision : undefined;
}

/** A period drawn as one moment, as the owner knows it: a day, a month, a year. */
function formatMoment(period: TimelinePeriod) {
  return formatPublicPeriodAtPrecision(
    { ...period, precision: precisionOf(period) },
    language.value.code,
  );
}

/** "По …" reads the end as it is; "С …" asks for the month after a day. */
function formatEnd(period: TimelinePeriod) {
  return formatPublicDateAtPrecision(
    period.endDate,
    precisionOf(period),
    language.value.code,
  ).standalone;
}

function formatEndGoverned(period: TimelinePeriod) {
  return formatPublicDateAtPrecision(
    period.endDate,
    precisionOf(period),
    language.value.code,
  ).governed;
}

function formatStart(period: TimelinePeriod) {
  return formatPublicDateAtPrecision(
    period.startDate,
    precisionOf(period),
    language.value.code,
  ).governed;
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
  // A period still to come has not happened: its dates stay quiet.
  if (stateOf(period) === 'upcoming')
    return [
      labelOf(period) ? 'text-xs' : 'text-sm leading-5',
      tone || 'text-text-3',
    ];
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
  <ol v-if="rows.length" class="flex flex-col">
    <li
      v-for="row in rows"
      :key="row.key"
      class="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-xs"
    >
      <PublicPeriodRail :mark="row.mark" :tail="row.tail" :muted="row.muted" />
      <div class="flex min-w-0 flex-col">
        <!-- A start the life timeline folded into one card with its end
             still opens at that card. -->
        <component
          :is="linkedDay(row.period, row.side !== 'start') ? TheiLink : 'div'"
          :to="
            linkedDay(row.period, row.side !== 'start')
              ? buildLifeUrl({
                  date: linkedDay(row.period, row.side !== 'start'),
                })
              : undefined
          "
          class="group flex min-w-0 flex-col rounded-xs text-text-1 transition
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none"
          :class="
            (row.side !== 'start' && labelOf(row.period)) ||
            !linkedDay(row.period, row.side !== 'start')
              ? ''
              : 'hocus:text-accent'
          "
        >
          <time
            v-if="row.side === 'start'"
            :datetime="row.period.startDate"
            class="flex items-center gap-1 leading-5"
            :class="dateClass(row.period, true)"
            v-bind="approximateTitle(row.period)"
          >
            <Icon v-if="approximate(row.period)" name="approximate" />
            {{ phrase.public_timeline_from(formatStart(row.period)) }}
          </time>
          <template v-else>
            <span
              v-if="labelOf(row.period) || row.muted"
              class="text-sm leading-5 wrap-break-word transition"
              :class="{
                'group-hocus:text-accent': linkedDay(row.period, true),
              }"
            >
              {{ publicText(labelOf(row.period))
              }}<span v-if="row.muted" class="text-text-3"
                >{{ labelOf(row.period) ? ' · ' : ''
                }}{{ phrase.period_state_upcoming }}</span
              >
            </span>
            <time
              :datetime="row.period.endDate"
              class="flex items-center gap-1"
              :class="dateClass(row.period)"
              v-bind="approximateTitle(row.period)"
            >
              <Icon v-if="approximate(row.period)" name="approximate" />
              <template v-if="row.side === 'day'">
                {{ formatMoment(row.period) }}
              </template>
              <template v-else-if="row.mark === 'ongoing'">
                {{
                  phrase.public_timeline_ongoing_until(
                    formatEndGoverned(row.period),
                  )
                }}
              </template>
              <template v-else>
                {{ phrase.public_timeline_until(formatEnd(row.period)) }}
              </template>
            </time>
          </template>
        </component>
        <span
          v-if="row.tail === 'bar'"
          class="py-xs text-xs leading-relaxed text-text-3 italic"
        >
          {{ row.between }}
        </span>
        <span
          v-else-if="row.tail === 'dots'"
          class="py-sm text-xs text-text-3 italic"
        >
          {{ row.between }}
        </span>
        <span
          v-else-if="row.tail === 'line'"
          class="h-xs"
          aria-hidden="true"
        ></span>
      </div>
    </li>
  </ol>
</template>
