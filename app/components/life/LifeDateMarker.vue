<script lang="ts" setup>
/**
 * The header of one day's segment: its date, set large and faded to the right.
 *
 * It is the reader's handle on the day — hovering tints it, clicking makes the
 * day active and puts a link to it on the clipboard. The year is drawn only on
 * the first segment of a year, where it earns the space.
 */
const { date, showYear } = defineProps<{
  date: string;
  showYear: boolean;
  active?: boolean;
  href: string;
}>();

const emit = defineEmits<{ pick: [] }>();

const parsed = computed(() => new Date(`${date}T00:00:00Z`));
const year = computed(() => date.slice(0, 4));
const dayNumber = computed(() =>
  new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed.value),
);
// Formatted alongside the day so languages that inflect the month name give
// the form a date actually uses ("декабря", not "декабрь").
const monthName = computed(
  () =>
    new Intl.DateTimeFormat(language.value.code, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
      .formatToParts(parsed.value)
      .find((part) => part.type === 'month')!.value,
);
</script>

<template>
  <div class="flex justify-end pb-xs select-none sm:pb-sm">
    <TheiLink
      :to="href"
      class="flex flex-col items-end leading-none font-bold transition-colors"
      :class="active ? 'text-accent' : 'text-text-3/45 hocus:text-accent/80'"
      :data-title-popup="phrase.life_copy_link"
      @click="emit('pick')"
    >
      <span
        v-if="showYear"
        class="mb-1 text-3xl tracking-tight tabular-nums opacity-80 sm:text-5xl"
      >
        {{ year }}
      </span>
      <span class="text-xl tracking-tight tabular-nums sm:text-3xl">
        {{ dayNumber }} <span class="lowercase">{{ monthName }}</span>
      </span>
    </TheiLink>
  </div>
</template>
