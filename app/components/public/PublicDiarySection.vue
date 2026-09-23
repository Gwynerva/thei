<script lang="ts" setup>
import type { PublicDiaryLink } from '#layers/thei/shared/api/public';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

/**
 * Diary entries tied to a page, as a block at the foot of it.
 *
 * A project shows these in its sidebar, where the column is narrow and the
 * list short. An event can gather dozens, and a narrow column is the wrong
 * place for dozens of anything — so here they get the full width and, past a
 * handful of lines, a scroller of their own.
 */
defineProps<{ entries?: PublicDiaryLink[] }>();
</script>

<template>
  <section
    v-if="entries?.length"
    :id="PUBLIC_DIARY_SECTION_ID"
    class="mt-lg flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
      gap-sm border-t border-border-1 pt-lg"
  >
    <h2 class="flex items-center gap-2 text-lg font-semibold text-text-2">
      <Icon name="thought" aria-hidden="true" />
      {{ phrase.diary_entries }}
    </h2>
    <PublicDiaryLinks :entries="entries" :max="6" />
  </section>
</template>

<script lang="ts">
/** The anchor the sidebar's quick link points at. */
export const PUBLIC_DIARY_SECTION_ID = 'diary-entries';

/** The entry this section adds to the table of contents. */
export function publicDiarySectionHeading(title: string): ContentHeading {
  return {
    title,
    level: 2,
    id: PUBLIC_DIARY_SECTION_ID,
    href: `#${PUBLIC_DIARY_SECTION_ID}`,
    path: PUBLIC_DIARY_SECTION_ID,
    icon: 'thought',
  };
}
</script>
