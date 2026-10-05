<script lang="ts" setup>
import type { AssetQualityStop } from '#layers/thei/shared/asset-quality-levels';
import type { DiscreteBarStop } from '../../components/field/discrete-bar-stops';
import UploadSettingsQualityBar from './UploadSettingsQualityBar.vue';

const qualityLevel = defineModel<AssetQualityStop>('qualityLevel', {
  required: true,
});
const mono = defineModel<boolean>('mono', { required: true });

/**
 * Settings for a recording: one channel or two, and how many bits each
 * second is worth. There is nothing to turn, crop or size.
 */
defineProps<{
  disabled?: boolean;
  /** The quality stops, each with the size it comes out at. */
  qualityStops: DiscreteBarStop[];
  /** The chosen stop's size with its unit. */
  qualityDetail?: string;
  /** Channels of the source, once known. */
  sourceChannels?: number;
}>();
</script>

<template>
  <fieldset :disabled="disabled" class="flex min-w-0 flex-col gap-sm">
    <div class="flex items-center gap-xs">
      <span
        class="grow text-sm text-text-2"
        :data-title-popup="phrase.upload_audio_mono_hint"
      >
        {{ phrase.upload_audio_mono }}
      </span>
      <!-- A mono source has one channel to keep: nothing to choose. -->
      <span v-if="sourceChannels === 1" class="text-sm text-text-3">
        {{ phrase.upload_audio_source_mono }}
      </span>
      <FieldToggle
        v-else
        v-model="mono"
        :switch-label="phrase.upload_audio_mono"
      />
    </div>

    <UploadSettingsQualityBar
      v-model="qualityLevel"
      :stops="qualityStops"
      :detail="qualityDetail"
      :disabled
    />
  </fieldset>
</template>
