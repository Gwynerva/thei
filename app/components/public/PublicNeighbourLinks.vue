<script lang="ts" setup>
import type { PublicNeighbour } from '#layers/thei/shared/api/public';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { PublicDetailNeighbours } from './public-detail';

/**
 * The way back to the stage, section or diary entry before this one, and on
 * to the next: side by side, "back" on the left and "next" on the right,
 * each with the other one's picture and name. Either is left out when there
 * is nothing that way, and the other keeps its side.
 *
 * The chevrons point where the reader goes, at the outer edges, so the pair
 * reads as a way back and a way forward. A long name is cut to one line.
 */
const { neighbours } = defineProps<{ neighbours: PublicDetailNeighbours }>();

const icon = computed(() => entityTypeIcon(neighbours.kind));

function title(neighbour: PublicNeighbour) {
  return neighbour.date && !neighbour.title
    ? formatAbsolutePublicDate(neighbour.date, language.value.code)
    : neighbour.title;
}

const linkClass = `group flex min-w-0 flex-col gap-0.5 rounded-sm px-1 py-1.5
  no-underline transition focus-visible:ring-2 focus-visible:ring-accent
  focus-visible:outline-none hocus:bg-bg-3/70`;
const labelClass = `flex max-w-full items-center gap-xs text-sm font-semibold
  text-text-2 transition-colors group-hocus:text-accent`;
</script>

<template>
  <nav class="grid grid-cols-2 gap-xs">
    <TheiLink
      v-if="neighbours.previous"
      :to="neighbours.previous.href"
      rel="prev"
      class="col-start-1 items-start text-left"
      :class="linkClass"
    >
      <span :class="labelClass">
        <Icon name="chevron-left" class="shrink-0" aria-hidden="true" />
        <span>{{ phrase.public_neighbour_previous }}</span>
        <BeveledIcon
          :media="neighbours.previous.media"
          :icon="icon"
          class="size-6"
        />
      </span>
      <span class="max-w-full truncate text-sm text-text-3">{{
        publicText(title(neighbours.previous))
      }}</span>
    </TheiLink>
    <TheiLink
      v-if="neighbours.next"
      :to="neighbours.next.href"
      rel="next"
      class="col-start-2 items-end text-right"
      :class="linkClass"
    >
      <span :class="labelClass">
        <BeveledIcon
          :media="neighbours.next.media"
          :icon="icon"
          class="size-6"
        />
        <span>{{ phrase.public_neighbour_next }}</span>
        <Icon name="chevron-right" class="shrink-0" aria-hidden="true" />
      </span>
      <span class="max-w-full truncate text-sm text-text-3">{{
        publicText(title(neighbours.next))
      }}</span>
    </TheiLink>
  </nav>
</template>
