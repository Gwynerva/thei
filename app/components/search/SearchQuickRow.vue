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
  /** The title with the words found marked. */
  titleSegments?: SearchSegment[];
  /** What it is a part of, quiet after the title: a section's project. */
  parent?: { title: string; media?: MediaDescriptor };
  /** Its day or period, quiet after the title. */
  when?: string;
  /** Its years, for a phone's line that has no room for its days. */
  years?: string;
  /** Who else may see it, for the owner. */
  access?: { icon: IconName; text: string };
  /** Where the words were found, before the words. */
  place?: string;
  segments?: SearchSegment[];
  /** A quieter line, when there are no words to show. */
  detail?: string;
  /** That line with the words found in it marked. */
  detailSegments?: SearchSegment[];
  /** Other places the words were found at, on a line of their own. */
  more?: number;
  media?: MediaDescriptor;
  /** A file's own preview, framed, instead of a picture along the edge. */
  preview?: boolean;
  /** Where Enter takes it; a row without one acts in a script. */
  href?: string;
  /** Where Shift+Enter takes it: the other side, page or editor. */
  other?: string;
  /** Its own way to `other`, on the last line, for a hand without Shift. */
  otherIcon?: IconName;
  /** Drawn in the accent: the ✦ of AI. */
  accent?: boolean;
}

/**
 * The row: the kind's glyph in the title's line, the found words under it
 * from the left edge, the picture dissolving in from the right where there
 * is one. `active` is the row Enter takes, ringed as a picker's row is
 * (`ContentEntityRow.vue`): the first, until the keys or the pointer choose
 * another, so what typing found is always one key away.
 */
defineProps<{ row: SearchQuickRowData; id: string; active: boolean }>();
defineEmits<{
  pick: [event: MouseEvent];
  point: [event: PointerEvent];
  /** The other places asked for: the search page, with them open. */
  more: [];
  /** The other side asked for: the editor, from the site. */
  other: [];
}>();
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
      class="search-row group relative flex w-full min-w-0 cursor-pointer
        items-center overflow-hidden rounded-sm text-left text-text-1
        no-underline transition-colors [--row-ground:var(--color-bg-2)]
        hocus:bg-bg-3 hocus:[--row-ground:var(--color-bg-3)]"
      :class="{
        'search-row-active bg-bg-3 [--row-ground:var(--color-bg-3)]': active,
      }"
      :data-active="active || undefined"
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
          <span class="-m-[0.75em] min-w-0 truncate p-[0.75em]"
            ><SearchSnippet
              v-if="row.titleSegments"
              :segments="row.titleSegments"
            /><template v-else>{{ row.title }}</template></span
          >
          <!-- Gives way before the title does. No room for the halo on the
               left: there it would cloud the title's last letters. -->
          <span
            v-if="row.parent"
            class="-my-[0.75em] -mr-[0.75em] flex min-w-0 shrink-[1000]
              items-center gap-1 overflow-hidden py-[0.75em] pr-[0.75em] text-xs
              font-normal text-text-3"
          >
            <span aria-hidden="true">·</span>
            <EntityTokenIcon
              :media="row.parent.media"
              icon="project"
              class="size-3.5 rounded-xs"
            />
            <span class="min-w-0 truncate">{{ row.parent.title }}</span>
          </span>
          <Icon
            v-if="row.access"
            :name="row.access.icon"
            :aria-label="row.access.text"
            role="img"
            class="shrink-0 text-sm text-text-2"
          />
          <!-- On a phone, where the days have no room, its years. Each
               quiet part after the title follows a dot, and keeps its halo
               off what stands before it. -->
          <span
            v-if="row.when"
            class="-my-[0.75em] -mr-[0.75em] shrink-0 overflow-hidden
              py-[0.75em] pr-[0.75em] text-xs font-normal text-text-3
              max-sm:hidden"
            >· {{ row.when }}</span
          >
          <span
            v-if="row.years"
            class="-my-[0.75em] -mr-[0.75em] shrink-0 overflow-hidden
              py-[0.75em] pr-[0.75em] text-xs font-normal text-text-3 sm:hidden"
            >· {{ row.years }}</span
          >
        </span>
        <!-- Two lines on a phone, clamped: a clamped box shows whatever its
             padding holds, so it has no room for the halo there, and stops
             short of the picture instead. -->
        <span
          v-if="row.segments?.length || row.detail || row.place"
          class="flex min-w-0 items-baseline gap-1.5 text-xs text-text-2"
          :class="{ 'max-sm:pr-8': row.media && !row.preview }"
        >
          <span
            class="min-w-0 max-sm:line-clamp-2 sm:-m-[0.75em] sm:truncate
              sm:p-[0.75em]"
            ><span v-if="row.place" class="text-text-3"
              >{{ row.place }}{{ row.segments?.length ? ': ' : '' }}</span
            ><SearchSnippet
              v-if="row.segments?.length"
              :segments="row.segments"
              class="text-text-2"
            /><SearchSnippet
              v-else-if="row.detailSegments"
              :segments="row.detailSegments"
            /><template v-else-if="row.detail">{{ row.detail }}</template></span
          >
        </span>
        <!-- The last line: the other places, and the way to the editor. -->
        <span
          v-if="row.more || row.otherIcon"
          class="flex min-w-0 items-center gap-md text-xs font-semibold
            text-text-3"
        >
          <!-- In words, under an arrow from the result: a bare «+5» on the
               picture's fading edge was all but unseen. The arrow's arm
               stands two thirds down its glyph: raised by the rest, it
               points at the middle of the words. Its own target inside the
               row: kept from the row's link, it leads to the search page
               with this result's places open. -->
          <span
            v-if="row.more"
            class="flex min-w-0 items-center gap-1.5 transition-colors
              hover:text-accent hover:underline"
            data-row-more
            @click.prevent="$emit('more')"
            ><Icon
              name="subfolder-arrow"
              class="shrink-0 -translate-y-[17%] text-sm"
              aria-hidden="true"
            /><span class="-m-[0.75em] min-w-0 truncate p-[0.75em]">{{
              phrase.search_more_finds(row.more)
            }}</span></span
          >
          <!-- The owner's way to its editor, a target of its own kept from
               the row's link: a hand has no Shift+Enter. -->
          <span
            v-if="row.otherIcon"
            role="link"
            class="-my-1.5 flex shrink-0 items-center gap-1 py-1.5
              transition-colors hover:text-accent hover:underline"
            data-row-other
            @click.prevent="$emit('other')"
          >
            <Icon :name="row.otherIcon" class="shrink-0" aria-hidden="true" />
            {{ phrase.search_edit }}
          </span>
        </span>
      </span>
      <span
        v-if="row.media && row.preview"
        class="relative mr-xs size-12 shrink-0 overflow-hidden rounded-xs border
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

<style scoped>
/*
 * An outline rather than an inset ring: it is drawn over the picture along
 * the edge, where an inset shadow would not be. Every row holds one, clear,
 * so the ring fades in with the row's colours from nothing: an outline that
 * arrived with its colour faded from the text's colour, a white flash.
 */
.search-row {
  outline: 2px solid transparent;
  outline-offset: -2px;
}

.search-row-active {
  outline-color: color-mix(in oklab, var(--color-accent) 60%, transparent);
}
</style>
