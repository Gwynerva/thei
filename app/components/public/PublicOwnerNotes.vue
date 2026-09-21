<script lang="ts" setup>
import type { PublicContentOutputData } from '#layers/thei/shared/content';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

/**
 * The owner's private notes, at the very bottom of a public page.
 *
 * A visitor never receives them, so this component simply renders what it was
 * given: the server decides who gets to see anything at all.
 */
const props = defineProps<{ notes?: PublicContentOutputData }>();

const PREVIEW_BLOCKS = 2;
const expanded = ref(false);
const blocks = computed(() => props.notes?.blocks ?? []);
const hasMore = computed(() => blocks.value.length > PREVIEW_BLOCKS);
const shown = computed<PublicContentOutputData>(() => ({
  ...(props.notes as PublicContentOutputData),
  blocks:
    expanded.value || !hasMore.value
      ? blocks.value
      : blocks.value.slice(0, PREVIEW_BLOCKS),
}));
</script>

<template>
  <section
    v-if="blocks.length"
    :id="PUBLIC_OWNER_NOTES_ID"
    class="mt-lg flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
      gap-sm border-t border-border-1 pt-lg"
  >
    <h2 class="flex items-center gap-2 text-lg font-semibold text-text-2">
      <Icon name="text" aria-hidden="true" />
      {{ phrase.entity_notes }}
    </h2>
    <ContentRenderer :data="shown" asset-viewer />
    <button
      v-if="hasMore && !expanded"
      type="button"
      class="cursor-pointer self-start text-sm font-semibold text-accent
        transition hocus:underline"
      @click="expanded = true"
    >
      {{ phrase.entity_notes_show_all }}
    </button>
  </section>
</template>

<script lang="ts">
/** The anchor the sidebar's quick link points at. */
export const PUBLIC_OWNER_NOTES_ID = 'owner-notes';

/** The entry this section adds to the table of contents. */
export function publicOwnerNotesHeading(title: string): ContentHeading {
  return {
    title,
    level: 2,
    id: PUBLIC_OWNER_NOTES_ID,
    href: `#${PUBLIC_OWNER_NOTES_ID}`,
    path: PUBLIC_OWNER_NOTES_ID,
    icon: 'text',
  };
}
</script>
