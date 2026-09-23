<script lang="ts" setup>
import type { PublicDiaryLink } from '#layers/thei/shared/api/public';

/**
 * Diary entries tied to something, as short dated lines.
 *
 * Deliberately not cards. A project or an event can gather dozens of entries,
 * and an entry has no title to make a card out of anyway — a day and the line
 * it opens with is the whole of what there is to show. Past a handful the list
 * scrolls inside itself rather than pushing the rest of the page down.
 */
const { entries, max = 8 } = defineProps<{
  entries: PublicDiaryLink[];
  /** How many lines fit before the list starts scrolling inside itself. */
  max?: number;
}>();

const scrolls = computed(() => entries.length > max);
const dayOf = (entry: PublicDiaryLink) =>
  formatAbsolutePublicDate(entry.date, language.value.code);
</script>

<template>
  <div
    class="flex min-w-0 flex-col"
    :class="scrolls && 'max-h-80 overflow-y-auto overscroll-contain pr-1'"
  >
    <TheiLink
      v-for="entry in entries"
      :key="entry.date"
      :to="entry.href"
      class="group flex min-w-0 items-baseline gap-xs rounded-sm border-b
        border-border-1/60 py-xs transition last:border-b-0
        hocus:border-border-2"
    >
      <Icon
        name="thought"
        class="shrink-0 self-center text-text-3 transition
          group-hocus:text-accent"
        aria-hidden="true"
      />
      <span
        class="shrink-0 text-xs font-semibold whitespace-nowrap text-text-3
          transition group-hocus:text-accent"
      >
        {{ dayOf(entry) }}
      </span>
      <span class="min-w-0 flex-1 truncate text-sm text-text-2 italic">
        {{ entry.excerpt }}
      </span>
      <Icon
        v-if="entry.access"
        name="lock-close"
        :data-title-popup="phrase.private_hint"
        :aria-label="phrase.private_hint"
        role="img"
        class="shrink-0 self-center text-text-3 opacity-60"
      />
    </TheiLink>
  </div>
</template>
