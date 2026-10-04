<script lang="ts" setup>
import type { PublicNeighbour } from '#layers/thei/shared/api/public';
import type { IconName } from '#thei/icons';
import type { PublicDetailNeighbours } from './public-detail';

/**
 * The way back to the section or diary entry before this one, and on
 * to the next: two tiles, the one before above the one after, each with the
 * other one's picture, its name, and what tells it apart — when a dated
 * section was, what another is about, how a diary entry begins. Either is left out when
 * there is nothing that way.
 *
 * The chevrons point where the reader goes, at the outer edges, and the
 * picture fills the other end, so the pair reads as a way back and a way on
 * without saying so; the words "back" and "next" are left to screen readers.
 * What a tile has to cut short is shown whole in its popup.
 */
const { neighbours } = defineProps<{ neighbours: PublicDetailNeighbours }>();

type Side = {
  key: 'previous' | 'next';
  neighbour: PublicNeighbour;
  rel: 'prev' | 'next';
  chevron: IconName;
  /** The reader's word for the way, said only to screen readers. */
  way: string;
};

const sides = computed<Side[]>(() => {
  const list: Side[] = [];
  if (neighbours.previous)
    list.push({
      key: 'previous',
      neighbour: neighbours.previous,
      rel: 'prev',
      chevron: 'chevron-left',
      way: phrase.value.public_neighbour_previous,
    });
  if (neighbours.next)
    list.push({
      key: 'next',
      neighbour: neighbours.next,
      rel: 'next',
      chevron: 'chevron-right',
      way: phrase.value.public_neighbour_next,
    });
  return list;
});

const isDiary = computed(() => neighbours.kind === 'diary-entry');

function title(neighbour: PublicNeighbour) {
  return publicText(
    neighbour.date && !neighbour.title
      ? formatAbsolutePublicDate(neighbour.date, language.value.code)
      : neighbour.title,
  );
}

/** The line under the name: a section's time, or the text it opens with. */
function detail(neighbour: PublicNeighbour) {
  if (neighbour.period)
    return getPublicDatePresentation(
      neighbour.period,
      language.value.code,
      new Date(),
      { style: 'short', ...publicDatePrecisionOptions() },
    ).label;
  return neighbour.summary ? publicText(neighbour.summary) : '';
}

/** The way, the name and what follows it, as a screen reader says the tile. */
function label(side: Side) {
  return [`${side.way}: ${title(side.neighbour)}`, detail(side.neighbour)]
    .filter(Boolean)
    .join(', ');
}

/** Everything the tile says, in full, only when the tile had to cut it. */
function popup(neighbour: PublicNeighbour) {
  const line = detail(neighbour);
  return {
    ...titlePopup(
      { text: title(neighbour), bold: true },
      line && { text: line, italic: isDiary.value && !neighbour.period },
    ),
    'data-title-popup-clipped': '',
  };
}
</script>

<template>
  <nav class="flex flex-col gap-xs">
    <MediaInteraction
      v-for="side in sides"
      :key="side.key"
      v-slot="{ engaged, events }"
    >
      <TheiLink
        v-on="events"
        :to="side.neighbour.href"
        :rel="side.rel"
        :aria-label="label(side)"
        v-bind="popup(side.neighbour)"
        class="group relative flex min-h-16 min-w-0 items-center gap-1
          overflow-hidden rounded-normal border border-border-1 bg-bg-2 py-xs
          text-text-1 no-underline transition focus-visible:ring-2
          focus-visible:ring-accent focus-visible:outline-none
          hocus:border-border-2 hocus:bg-bg-3/70"
        :class="
          side.key === 'previous' ? 'pr-sm pl-1' : 'flex-row-reverse pr-1 pl-sm'
        "
        :data-neighbour="side.key"
      >
        <MediaEdge
          :media="side.neighbour.media"
          :side="side.key === 'previous' ? 'right' : 'left'"
          fade="preview"
          playback="interaction"
          :engaged
          class="w-2/5 max-w-28"
        />
        <Icon
          :name="side.chevron"
          aria-hidden="true"
          class="relative z-1 shrink-0 text-xl text-text-3 transition
            group-hocus:text-accent"
          :class="
            side.key === 'previous'
              ? 'motion-safe:group-hocus:-translate-x-0.5'
              : 'motion-safe:group-hocus:translate-x-0.5'
          "
        />
        <!-- The words keep clear of the window where the picture stays
             sharp, and carry a halo where they reach over the rest of it. -->
        <span
          class="neighbour-text relative z-1 flex min-w-0 flex-1 flex-col
            gap-0.5"
          :class="side.key === 'previous' ? 'pr-10' : 'pl-10'"
        >
          <span
            class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-sm font-semibold
              transition-colors group-hocus:text-accent"
            data-title-popup-clip
            >{{ title(side.neighbour) }}</span
          >
          <span
            v-if="detail(side.neighbour)"
            class="-mx-[0.75em] px-[0.75em] text-xs text-text-3"
            :class="
              side.neighbour.period
                ? 'truncate'
                : ['line-clamp-2', { italic: isDiary }]
            "
            data-title-popup-clip
            >{{ detail(side.neighbour) }}</span
          >
        </span>
      </TheiLink>
    </MediaInteraction>
  </nav>
</template>

<style scoped>
.neighbour-text {
  text-shadow:
    0 0 0.5em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.12em 0.45em var(--color-bg-2);
}
</style>
