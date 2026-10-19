<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { SearchSegment } from '#layers/thei/shared/search/snippet';
import TheiLink from '#layers/thei/app/components/TheiLink';

/** One row of the quick search: a result, or something the owner may do. */
export interface SearchQuickRowData {
  key: string;
  icon: IconName;
  /** What the icon says, for those who do not see it: the kind. */
  iconLabel?: string;
  title: string;
  /** Its day or period, quiet after the title. */
  when?: string;
  /** Who else may see it, for the owner. */
  access?: { icon: IconName; text: string };
  /** Where the words were found, before the words. */
  place?: string;
  segments?: SearchSegment[];
  /** A quieter line, when there are no words to show. */
  detail?: string;
  /** Other places the words were found at. */
  more?: number;
  media?: MediaDescriptor;
  /** A file's own preview, framed, instead of a picture along the edge. */
  preview?: boolean;
  /** Where Enter takes it; a row without one acts in a script. */
  href?: string;
  /** Where Shift+Enter takes it: the other side, page or editor. */
  other?: string;
  /** Drawn in the accent: the ✦ of AI. */
  accent?: boolean;
}

/**
 * The row: the kind's glyph in the title's line, the found words under it
 * from the left edge, the picture dissolving in from the right where there
 * is one. `active` is the row Enter takes, ringed in the accent.
 */
defineProps<{ row: SearchQuickRowData; id: string; active: boolean }>();
defineEmits<{ pick: [event: MouseEvent]; point: [event: PointerEvent] }>();
</script>

<template>
  <MediaInteraction v-slot="{ engaged, events }">
    <component
      :is="row.href ? TheiLink : 'button'"
      v-on="events"
      :id
      :to="row.href"
      :type="row.href ? undefined : 'button'"
      role="option"
      :aria-selected="active"
      tabindex="-1"
      class="group relative flex w-full min-w-0 cursor-pointer items-center
        overflow-hidden rounded-sm text-left text-text-1 no-underline
        transition-colors [--row-ground:var(--color-bg-2)] hocus:bg-bg-3
        hocus:[--row-ground:var(--color-bg-3)]"
      :class="{
        [`bg-bg-3 ring-2 ring-accent/60 [--row-ground:var(--color-bg-3)]
        ring-inset`]: active,
      }"
      @pointermove="$emit('point', $event)"
      @click="$emit('pick', $event)"
    >
      <MediaEdge
        v-if="row.media && !row.preview"
        :media="row.media"
        side="right"
        fade="preview"
        playback="interaction"
        :engaged
        class="w-24"
      />
      <!-- A truncated line clips its own halo, which draws a hard seam
           across the picture: each gets room for the halo all round. -->
      <span
        class="text-halo-(--row-ground) relative flex min-w-0 flex-1 flex-col
          gap-0.5 py-1.5 pl-xs"
        :class="row.media && !row.preview ? 'pr-16' : 'pr-xs'"
      >
        <span
          class="flex min-w-0 items-center gap-1.5 text-sm font-semibold"
          :class="{ 'text-accent': row.accent }"
        >
          <Icon
            :name="row.icon"
            :aria-label="row.iconLabel"
            :role="row.iconLabel ? 'img' : undefined"
            :aria-hidden="row.iconLabel ? undefined : 'true'"
            class="shrink-0"
            :class="row.accent ? 'text-accent' : 'text-text-2'"
          />
          <span class="-m-[0.75em] min-w-0 truncate p-[0.75em]">{{
            row.title
          }}</span>
          <Icon
            v-if="row.access"
            :name="row.access.icon"
            :aria-label="row.access.text"
            role="img"
            class="shrink-0 text-xs text-text-3"
          />
          <span
            v-if="row.when"
            class="-m-[0.75em] shrink-0 p-[0.75em] text-xs font-normal
              text-text-3"
            >{{ row.when }}</span
          >
        </span>
        <span
          v-if="row.segments?.length || row.detail || row.place"
          class="flex min-w-0 items-baseline gap-1.5 text-xs text-text-3"
        >
          <span class="-m-[0.75em] min-w-0 truncate p-[0.75em]"
            ><span v-if="row.place" class="text-text-3/80"
              >{{ row.place }}{{ row.segments?.length ? ': ' : '' }}</span
            ><SearchSnippet
              v-if="row.segments?.length"
              :segments="row.segments"
              class="text-text-2"
            /><template v-else-if="row.detail">{{ row.detail }}</template></span
          >
          <span
            v-if="row.more"
            class="shrink-0 tabular-nums opacity-70"
            :aria-label="phrase.search_more_finds(row.more)"
            >+{{ row.more }}</span
          >
        </span>
      </span>
      <span
        v-if="row.media && row.preview"
        class="relative mr-xs size-10 shrink-0 overflow-hidden rounded-xs border
          border-border-1 bg-bg-3"
      >
        <Media
          v-bind="row.media"
          playback="interaction"
          :engaged
          muted
          class="size-full"
        />
      </span>
    </component>
  </MediaInteraction>
</template>
