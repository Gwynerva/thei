<script lang="ts" setup>
const props = defineProps<{ timestamp: string; static?: boolean }>();

const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

function formatRelative(date: Date, locale: string): string {
  const diff = date.getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const { unit, ms } = UNITS.find((u) => absDiff >= u.ms) ?? UNITS.at(-1)!;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    Math.round(diff / ms),
    unit,
  );
}

const languageCode = useLanguageCode();
const locale = computed(() => languageCode.value ?? 'en');

const date = computed(() => {
  const ts = props.timestamp;
  // SQLite current_timestamp is 'YYYY-MM-DD HH:MM:SS' (UTC, no trailing Z)
  return new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
});

const isRecent = computed(() => {
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - 3);
  return date.value > threshold;
});

const formatted = computed(() =>
  isRecent.value
    ? formatRelative(date.value, locale.value)
    : date.value.toLocaleDateString(locale.value, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
);
</script>

<template>
  <time v-if="props.static" :datetime="date.toISOString()">{{
    formatted
  }}</time>
  <NuxtTime v-else-if="isRecent" :datetime="date" :locale="locale" relative />
  <NuxtTime
    v-else
    :datetime="date"
    :locale="locale"
    day="numeric"
    month="long"
    year="numeric"
  />
</template>
