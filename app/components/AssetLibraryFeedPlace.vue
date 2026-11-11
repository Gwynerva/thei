<script setup lang="ts">
import type {
  AssetLibraryEntry,
  AssetLibraryItem,
  AssetLibraryPlace,
} from '#layers/thei/shared/asset-library';
import {
  assetSourceIcon,
  assetSourceTitle,
} from '../composables/asset-library-labels';
import AssetPlaceParent from '../modals/asset-modal/AssetPlaceParent.vue';

/**
 * One place of the library's run (`AssetLibraryFeed`) and its files: a
 * rounded line of words — what the place is a part of, over its kind's
 * icon, its name and its day where the name does not say it — with the
 * place's picture along the right edge, dissolving into the line; under it,
 * a grid of its tiles. The files nothing holds are a line in red.
 */
const props = defineProps<{
  placeKey: string;
  place: AssetLibraryPlace;
  entries: AssetLibraryEntry[];
  selected?: Set<string>;
  busy?: boolean;
  editable?: boolean;
  titleOf: (item: AssetLibraryItem) => string;
}>();
const emit = defineEmits<{
  choose: [item: AssetLibraryItem];
  edit: [item: AssetLibraryItem];
  key: [event: KeyboardEvent, item: AssetLibraryItem];
}>();

/**
 * A place's day where its name does not already say it, always as the day
 * itself: «месяц назад» beside «3 октября 2026» reads as two orders.
 */
const day = computed(() => {
  if (!props.place.date || props.place.type === 'diary-entry') return undefined;
  // An excerpt of a diary entry stands at the entry's day, named above it.
  if (props.place.parent?.type === 'diary-entry') return undefined;
  return formatAbsolutePublicDate(props.place.date, language.value.code);
});
/** The files nothing holds: the group that is about to go, drawn in red. */
const unused = computed(() => props.place.type === 'unused');
</script>

<template>
  <div class="flex flex-col gap-xs pb-sm" :data-feed-place="placeKey">
    <div
      class="relative isolate flex min-h-12 min-w-0 items-center overflow-hidden
        rounded-normal"
      :data-title-popup="unused ? phrase.asset_library_unused_hint : undefined"
      data-feed-place-head
    >
      <!-- The line's ground is clear at the left, where its words stand on
           the page as the tiles under them do, and gathers towards the
           right edge: nothing reads as a block standing out. -->
      <span
        class="pointer-events-none absolute inset-0 rounded-normal
          [mask-image:linear-gradient(to_right,transparent,black_75%)]"
        :class="unused ? 'bg-bg-error' : 'border border-border-1 bg-bg-3'"
        aria-hidden="true"
        data-feed-place-ground
      ></span>
      <!-- A place with no picture has its kind's icon at the edge instead:
           the bin, for the files nothing holds. The picture is still:
           the line is a heading, not something to open. -->
      <MediaEdge
        :media="place.media"
        side="right"
        fade="card"
        playback="interaction"
        media-class="opacity-75"
        class="w-80 max-w-2/5"
        :data-feed-place-media="place.media ? '' : undefined"
      >
        <span
          class="flex size-full items-center justify-end pr-sm text-xl"
          :class="unused ? 'text-text-error' : 'text-text-3'"
        >
          <Icon :name="assetSourceIcon[place.type]" />
        </span>
      </MediaEdge>
      <!-- The words keep to the left of the picture: on a clear ground they
           have no halo to stand over it with. -->
      <span
        class="relative z-1 flex min-w-0 flex-col gap-0.5 py-2.5 text-base"
        :class="place.media ? 'max-w-3/4' : 'pr-10'"
      >
        <AssetPlaceParent
          v-if="place.parent"
          :parent="place.parent"
          clipped
          class="text-sm"
          data-feed-place-parent
        />
        <span class="flex min-w-0 items-center gap-1">
          <Icon
            :name="assetSourceIcon[place.type]"
            class="shrink-0"
            :class="unused ? 'text-text-error' : 'text-text-3'"
          /><span
            class="min-w-0 truncate font-semibold"
            :class="unused ? 'text-text-error' : 'text-text-1'"
            data-title-popup-clipped
            data-feed-place-title
            >{{ assetSourceTitle(place) }}</span
          ><span v-if="day" class="shrink-0 text-sm text-text-3 tabular-nums"
            >· {{ day }}</span
          >
        </span>
      </span>
    </div>
    <div
      class="grid grid-cols-3 gap-xs
        sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]"
    >
      <AssetLibraryFeedTile
        v-for="item in entries"
        :key="item.asset.assetUuid"
        :item
        :selected="selected?.has(item.asset.assetUuid)"
        :busy
        :editable
        :title="titleOf(item)"
        @choose="emit('choose', item)"
        @edit="emit('edit', item)"
        @key="emit('key', $event, item)"
      />
    </div>
  </div>
</template>
