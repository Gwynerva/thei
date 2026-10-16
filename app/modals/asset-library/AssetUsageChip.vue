<script lang="ts" setup>
import type {
  AssetPlacement,
  AssetSource,
} from '#layers/thei/shared/asset-library';
import AssetPlaceChip from '../asset-modal/AssetPlaceChip.vue';
import {
  assetPlacementLabel,
  assetSourceIcon,
  assetSourceTitle,
} from '../../composables/asset-library-labels';

/**
 * One place of the library's file, as the admin sees it: every use there,
 * private ones counted apart. The chip opens the place's editor in a new
 * tab.
 */
const { source, placements } = defineProps<{
  source: AssetSource;
  placements: AssetPlacement[];
}>();

const title = computed(() => assetSourceTitle(source));

/** Each way it is used once, with how many times; and how many are private. */
const uses = computed(() => {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    const label = assetPlacementLabel(placement);
    counts.set(label, (counts.get(label) ?? 0) + placement.count);
  }
  return [...counts]
    .map(([label, count]) => (count > 1 ? `${label} ×${count}` : label))
    .join(' · ');
});
const privateCount = computed(() =>
  placements
    .filter((placement) => placement.isPrivate)
    .reduce((sum, placement) => sum + placement.count, 0),
);
</script>

<template>
  <AssetPlaceChip
    :href="source.editUrl"
    new-tab
    :hint="source.editUrl ? phrase.asset_open_place(title) : undefined"
    :media="source.media"
    :icon="assetSourceIcon[source.type]"
    :title
    :parent="source.parent ? publicText(source.parent.title) : undefined"
    :uses
    :private-count="privateCount"
  />
</template>
