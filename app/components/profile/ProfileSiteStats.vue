<script setup lang="ts">
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { PublicProfileResponse } from '#layers/thei/shared/profile';
import { buildLifeUrl } from '#layers/thei/shared/life';
const props = defineProps<{ counts: PublicProfileResponse['counts'] }>();
const compactNumber = useCompactNumber();
/**
 * One column per main kind the archive holds, each opening Life filtered to
 * it; a kind with nothing in it is left out.
 */
const columns = computed(() =>
  (
    [
      ['project', props.counts.projects],
      ['event', props.counts.events],
      ['diary-entry', props.counts.diaryEntries],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => {
      const exact = count.toLocaleString(language.value.code);
      const label = phrase.value.profile_counter_label(kind, count);
      return {
        kind,
        href: buildLifeUrl({ filter: [kind] }),
        // Whole up to four digits; shortened past them, the hint says it whole.
        shown: count < 10_000 ? exact : compactNumber(count),
        word: phrase.value.profile_counter(kind, count),
        label,
        hint: count < 10_000 ? undefined : label,
      };
    }),
);
</script>
<template>
  <!-- The rule between columns is an element of its own: a border on a
       rounded link would bend with its corners. -->
  <div v-if="columns.length" class="flex items-stretch justify-center">
    <template v-for="(column, index) in columns" :key="column.kind"
      ><span
        v-if="index"
        class="w-px shrink-0 bg-border-1"
        aria-hidden="true"
      /><TheiLink
        :to="column.href"
        :aria-label="column.label"
        :data-title-popup="column.hint"
        class="group flex min-w-0 flex-1 flex-col items-center rounded-sm px-md
          text-center focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none"
        ><span
          class="text-2xl leading-tight font-bold tabular-nums transition-colors
            group-hocus:text-accent max-sm:text-xl"
          >{{ column.shown }}</span
        ><span
          class="flex items-center gap-1 text-sm whitespace-nowrap text-text-2
            transition-colors group-hocus:text-accent"
          ><Icon :name="entityTypeIcon(column.kind)" />{{ column.word }}</span
        ></TheiLink
      ></template
    >
  </div>
</template>
