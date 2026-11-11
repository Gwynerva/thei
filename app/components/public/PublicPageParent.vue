<script lang="ts" setup>
import type { PublicPageNamed } from './public-detail';

/**
 * "Project section <project>", "Excerpt <parent> About <subject>": the line
 * of text above a title that says what the page is and names the entities
 * it stands by, each as a chip (`EntityChip`).
 *
 * Deliberately not a button and not a "back" arrow: the page is part of the
 * project, not a step away from it. The faint bold label says what the page
 * is; the chip after it is the one link back. An excerpt's page names two —
 * what it is a part of, then what it is about — in the one line while both
 * fit; too narrow for that, what it is about moves whole to a line of its
 * own. The lines stand as the header does: in the middle on a phone, from
 * the left on a wider screen. It reads the same in the plain header and in a
 * banner's dark hero (`onDark`), and stands close over the title it heads.
 */
const { parent, subject } = defineProps<{
  parent: PublicPageNamed;
  /**
   * What the page is about, after what it is a part of: an excerpt's
   * subject. A find of the relation's note lands on it
   * (`r-<kind>~<address>`).
   */
  subject?: PublicPageNamed;
  /** Over a banner, in white, as everything in the hero is. */
  onDark?: boolean;
  /**
   * An arrow before the name, coming up from the title under the line and
   * turning right to the name: the title is about what the line names, as
   * an excerpt is on its parent's page.
   */
  arrow?: 'start';
}>();

const named = computed(() => [
  { key: 'parent', entity: parent },
  ...(subject ? [{ key: 'subject', entity: subject }] : []),
]);
</script>

<template>
  <!--
    A div, not a p: a chip's picture renders Media, whose root is a div, and
    a browser parsing the server's HTML closes a p before it — the link then
    hydrates against a tree the server never meant.
  -->
  <div
    class="flex max-w-full min-w-0 flex-wrap items-center justify-center
      gap-x-sm gap-y-xs text-sm sm:justify-start"
  >
    <!-- Each entity keeps its label: a line breaks only between them. -->
    <span
      v-for="{ key, entity } in named"
      :key
      class="inline-flex max-w-full min-w-0 items-center gap-xs"
      :data-page-parent="key"
      :data-relation-href="key === 'subject' ? entity.href : undefined"
    >
      <span
        v-if="entity.label"
        class="shrink-0 font-bold"
        :class="onDark ? 'text-white/60' : 'text-text-3'"
        >{{ entity.label }}</span
      >
      <Icon
        v-if="arrow === 'start'"
        name="subfolder-arrow"
        class="shrink-0 -translate-y-[12%] [transform:scaleY(-1)]"
        :class="onDark ? 'text-white/60' : 'text-text-3'"
        aria-hidden="true"
        data-parent-arrow
      />
      <EntityChip
        :title="publicText(entity.title)"
        :href="entity.href"
        :media="entity.iconMedia"
        :icon="entity.icon ?? 'project'"
        :on-dark
        :card="entity.card"
      />
      <PublicRelationInline
        v-if="entity.relation"
        :type="entity.relation.type"
        :note="entity.relation.note"
        :class="onDark ? 'text-white/70!' : ''"
      />
    </span>
  </div>
</template>
