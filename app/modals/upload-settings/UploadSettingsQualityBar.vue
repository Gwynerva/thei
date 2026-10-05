<script lang="ts" setup>
import type { AssetQualityStop } from '#layers/thei/shared/asset-quality-levels';
import type { DiscreteBarStop } from '../../components/field/discrete-bar-stops';

/** How many bits each second or each pixel is worth, as a bar of stops. */
const qualityLevel = defineModel<AssetQualityStop>({ required: true });
/** The bar deals in plain strings; the stops it is given are the levels. */
const levelModel = computed<string>({
  get: () => qualityLevel.value,
  set: (stop) => {
    qualityLevel.value = stop as AssetQualityStop;
  },
});

defineProps<{
  /** The quality stops, each with the size it comes out at. */
  stops: DiscreteBarStop[];
  /** The chosen stop's size with its unit. */
  detail?: string;
  disabled?: boolean;
}>();
</script>

<template>
  <FieldDiscreteBar
    v-model="levelModel"
    :stops
    :label="phrase.upload_quality"
    :title="phrase.upload_quality"
    :detail
    :disabled
  />
</template>
