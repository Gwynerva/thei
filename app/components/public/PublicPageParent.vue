<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';
import TheiLink from '../TheiLink';
import type { RelationType } from '#layers/thei/shared/relation';

/**
 * "Project section — <project>", as a line of text above a title.
 *
 * Deliberately not a button and not a "back" arrow: the page is part of the
 * project, not a step away from it. The faint bold label says what the page
 * is; the project's icon and name after it are the one link back. It is one
 * line wherever it stands, the plain header or a banner's dark hero
 * (`onDark`), and stands close over the title it heads.
 */
defineProps<{
  parent: {
    /** The faint words before it; none where the line is the entity alone. */
    label?: string;
    /** None for what the reader may not open: then the name is no link. */
    href?: string;
    title: string;
    iconMedia?: MediaDescriptor;
    /** The kind's icon, where the parent has no picture: a project's. */
    icon?: IconName;
    /** How the page relates to it, said after its name: an excerpt's subject. */
    relation?: { type: RelationType; note?: string };
  };
  /** Over a banner, in white, as everything in the hero is. */
  onDark?: boolean;
  /**
   * An arrow at the end that turns down, to the title under the line: what
   * the line names leads into it, as what an excerpt is about does.
   */
  arrow?: boolean;
}>();
</script>

<template>
  <!--
    A div, not a p: the project's icon renders Media, whose root is a div, and
    a browser parsing the server's HTML closes a p before it — the link then
    hydrates against a tree the server never meant.
  -->
  <div
    class="flex max-w-full min-w-0 flex-wrap items-center justify-center gap-x-2
      gap-y-1 text-sm sm:justify-start"
  >
    <!-- Too narrow for one line, the project moves to a line of its own. -->
    <span
      v-if="parent.label"
      class="shrink-0 font-bold"
      :class="onDark ? 'text-white/60' : 'text-text-3'"
      >{{ parent.label }}</span
    >
    <component
      :is="parent.href ? TheiLink : 'span'"
      :to="parent.href"
      class="inline-flex max-w-full min-w-0 items-center gap-xs rounded-sm
        font-semibold transition focus-visible:ring-2
        focus-visible:outline-none"
      :class="
        onDark
          ? 'text-white/90 focus-visible:ring-white hocus:text-white'
          : 'text-text-1 focus-visible:ring-accent hocus:text-accent'
      "
    >
      <EntityTokenIcon
        :media="parent.iconMedia"
        :icon="parent.icon ?? 'project'"
        plain
        class="size-6"
      />
      <span class="min-w-0 truncate">{{ publicText(parent.title) }}</span>
    </component>
    <PublicRelationInline
      v-if="parent.relation"
      :type="parent.relation.type"
      :note="parent.relation.note"
      :class="onDark ? 'text-white/70!' : ''"
    />
    <!-- The curved arrow, turned to run from the left and then down. -->
    <Icon
      v-if="arrow"
      name="subfolder-arrow"
      class="shrink-0 translate-y-[12%] [transform:rotate(90deg)_scaleY(-1)]"
      :class="onDark ? 'text-white/60' : 'text-text-3'"
      aria-hidden="true"
      data-parent-arrow
    />
  </div>
</template>
