<script lang="ts" setup>
type InfoBlockValue = string | number | null | undefined;
type InfoBlockTone = 'neutral' | 'good' | 'bad';
type InfoBlockComparisonValue = {
  previous: InfoBlockValue;
  current: InfoBlockValue;
  tone?: InfoBlockTone;
};
type InfoBlockRowValue =
  | InfoBlockValue
  | [InfoBlockValue, InfoBlockValue]
  | InfoBlockComparisonValue;

interface InfoBlockRow {
  label: string;
  value?: InfoBlockRowValue;
  uppercase?: boolean;
}

const props = defineProps<{
  rows: InfoBlockRow[];
}>();

const visibleRows = computed(() =>
  props.rows.filter((row) => row.value !== undefined),
);

function hasValue(value: InfoBlockValue) {
  return value !== undefined && value !== null && value !== '';
}

function previousValue(row: InfoBlockRow) {
  if (Array.isArray(row.value)) return row.value[0];
  if (isComparisonValue(row.value)) return row.value.previous;
  return undefined;
}

function currentValue(row: InfoBlockRow) {
  if (Array.isArray(row.value)) return row.value[1];
  if (isComparisonValue(row.value)) return row.value.current;
  return row.value;
}

function shouldCompare(row: InfoBlockRow) {
  return (
    (Array.isArray(row.value) || isComparisonValue(row.value)) &&
    String(previousValue(row) ?? '') !== String(currentValue(row) ?? '')
  );
}

function currentValueClass(row: InfoBlockRow) {
  if (!isComparisonValue(row.value) || !shouldCompare(row)) {
    return row.uppercase ? 'uppercase' : '';
  }

  return [
    row.uppercase ? 'uppercase' : '',
    row.value.tone === 'good' ? 'text-accent' : '',
    row.value.tone === 'bad' ? 'text-text-error' : '',
  ];
}

function isComparisonValue(
  value: InfoBlockRowValue,
): value is InfoBlockComparisonValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
</script>

<template>
  <div class="flex flex-col text-sm tracking-tight text-text-2">
    <div
      v-for="row in visibleRows"
      :key="row.label"
      class="flex justify-between gap-sm"
    >
      <div class="shrink-0">{{ row.label }}</div>
      <div class="flex min-w-0 items-center justify-end gap-1 font-semibold">
        <template v-if="shouldCompare(row)">
          <span
            class="min-w-0 truncate text-xs font-medium text-text-3"
            :class="row.uppercase ? 'uppercase' : ''"
          >
            <template v-if="hasValue(previousValue(row))">
              {{ previousValue(row) }}
            </template>
            <em v-else class="opacity-50">{{ phrase.file_info_empty }}</em>
          </span>
          <Icon name="chevron-right" class="shrink-0 text-xs text-text-3" />
        </template>
        <span
          class="min-w-0 truncate"
          :class="currentValueClass(row)"
        >
          <template v-if="hasValue(currentValue(row))">
            {{ currentValue(row) }}
          </template>
          <em v-else class="opacity-50">{{ phrase.file_info_empty }}</em>
        </span>
      </div>
    </div>
  </div>
</template>
