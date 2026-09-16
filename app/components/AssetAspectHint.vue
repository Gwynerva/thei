<script lang="ts" setup>
import {
  getAssetUploadProfileAspect,
  type AssetUploadProfile,
} from '#layers/thei/shared/asset-upload-profiles';

/**
 * The proportions a non-square upload slot expects, drawn as a tiny frame of
 * that exact shape next to the ratio and a reference size. Renders nothing for
 * square slots, where the expectation goes without saying.
 */
const props = defineProps<{ profile?: AssetUploadProfile }>();
const aspect = computed(() => getAssetUploadProfileAspect(props.profile));
const hint = computed(
  () =>
    aspect.value &&
    phrase.value.asset_aspect_hint(
      aspect.value.ratio,
      `${aspect.value.width} × ${aspect.value.height}`,
    ),
);
</script>

<template>
  <span
    v-if="aspect"
    role="note"
    :aria-label="hint"
    :data-title-popup="hint"
    class="inline-flex max-w-full cursor-help items-center gap-xs rounded-sm
      bg-bg-3 px-xs py-1 text-xs leading-none font-semibold whitespace-nowrap
      text-text-2 tabular-nums"
    data-asset-aspect-hint
  >
    <span
      class="h-3 shrink-0 rounded-xs border-2 border-accent"
      :style="{ aspectRatio: `${aspect.width} / ${aspect.height}` }"
      aria-hidden="true"
    ></span>
    <span aria-hidden="true">{{ aspect.ratio }}</span>
    <span class="truncate text-text-3" aria-hidden="true"
      >{{ aspect.width }} × {{ aspect.height }}</span
    >
  </span>
</template>
