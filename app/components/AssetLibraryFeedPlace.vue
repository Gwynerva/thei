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

/**
 * One place of the library's run (`AssetLibraryFeed`) and its files: a small
 * line — the kind's icon, the place's name, what it is a part of, its day
 * where the name does not say it — over a grid of its tiles.
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
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${props.place.date}T00:00:00Z`));
});
</script>

<template>
  <div class="flex flex-col gap-xs pb-sm" :data-feed-place="placeKey">
    <p
      class="flex min-w-0 items-center gap-1 text-xs text-text-2"
      :data-title-popup="
        place.type === 'unused' ? phrase.asset_library_unused_hint : undefined
      "
    >
      <Icon
        :name="assetSourceIcon[place.type]"
        class="shrink-0 text-text-3"
      /><span
        class="min-w-0 truncate font-semibold text-text-1"
        data-title-popup-clipped
        >{{ assetSourceTitle(place) }}</span
      ><span
        v-if="place.parent"
        class="min-w-0 truncate text-text-3"
        data-title-popup-clipped
        >· {{ publicText(place.parent.title) }}</span
      ><span v-if="day" class="shrink-0 text-text-3 tabular-nums"
        >· {{ day }}</span
      >
    </p>
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
