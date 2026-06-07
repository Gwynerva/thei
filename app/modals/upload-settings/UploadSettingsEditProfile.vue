<script lang="ts" setup>
import UploadSettingsFileComparison from './UploadSettingsFileComparison.vue';

type BusyAction = 'variants' | 'upload-original' | 'apply';

interface FileDimensions {
  width: number;
  height: number;
}

const quality = defineModel<number>('quality', { required: true });
const widthInput = defineModel<string>('widthInput', { required: true });
const heightInput = defineModel<string>('heightInput', { required: true });
const keepAspect = defineModel<boolean>('keepAspect', { required: true });
const muteAudio = defineModel<boolean>('muteAudio');
const fastConversion = defineModel<boolean>('fastConversion');

defineProps<{
  isVideo: boolean;
  qualityValues: number[];
  availableSizePresets: number[];
  showResetDimensions: boolean;
  showRecommendedButton: boolean;
  busyAction?: BusyAction;
  applyButtonText: string;
  canUseTransformed: boolean;
  showResult: boolean;
  previousFile: {
    extension?: string;
    size?: number;
    dimensions?: FileDimensions;
  };
  currentFile: {
    extension?: string;
    size?: number;
    dimensions?: FileDimensions;
  };
}>();

const emit = defineEmits<{
  applyRecommendedSettings: [];
  resetDimensions: [];
  applySizePreset: [size: number];
  syncHeightFromWidth: [];
  syncWidthFromHeight: [];
  applySettings: [];
  finish: [];
}>();
</script>

<template>
  <FieldSlider
    v-model="quality"
    :values="qualityValues"
    :format="(value) => `${value}%`"
    class="-mt-3"
  >
    <template #before>
      <div class="relative -top-3 text-sm leading-0 tracking-tight text-text-2">
        {{ phrase.upload_quality }}
      </div>
    </template>
  </FieldSlider>

  <div class="flex items-center justify-between">
    <div class="text-sm text-text-2">{{ phrase.upload_dimensions }}</div>
    <button
      v-if="showResetDimensions"
      class="cursor-pointer rounded-normal bg-bg-3 px-2 py-1 text-xs text-text-2
        transition hocus:bg-accent/50 hocus:text-text-1"
      @click="emit('resetDimensions')"
    >
      {{ phrase.upload_reset_dimensions }}
    </button>
  </div>

  <div class="flex items-center gap-xs text-sm text-text-2">
    <FieldInput
      v-model="widthInput"
      inputmode="numeric"
      type="text"
      class="min-w-2! p-2!"
      @blur="emit('syncHeightFromWidth')"
      @submit="emit('syncHeightFromWidth')"
    />
    <button
      class="flex size-9 shrink-0 cursor-pointer items-center justify-center
        rounded-full bg-transparent transition hocus:bg-bg-3"
      :data-title-popup="phrase.upload_keep_aspect"
      :class="
        keepAspect
          ? 'text-accent hocus:text-accent'
          : 'text-text-3 hocus:text-text-1'
      "
      @click="keepAspect = !keepAspect"
    >
      <Icon name="link" class="size-3/5" />
    </button>
    <FieldInput
      v-model="heightInput"
      inputmode="numeric"
      type="text"
      class="min-w-2! p-2!"
      @blur="emit('syncWidthFromHeight')"
      @submit="emit('syncWidthFromHeight')"
    />
  </div>

  <div
    v-if="availableSizePresets.length"
    class="flex items-center gap-px text-xs"
  >
    <button
      v-for="size of availableSizePresets"
      :key="size"
      class="cursor-pointer bg-bg-3 px-2 py-1 text-text-2 transition
        first:rounded-l-normal last:rounded-r-normal hocus:bg-accent/50
        hocus:text-text-1"
      @click="emit('applySizePreset', size)"
    >
      {{ size }}
    </button>
  </div>

  <FieldToggle v-if="isVideo" v-model="muteAudio">
    <div
      @click="muteAudio = !muteAudio"
      class="w-full cursor-pointer text-sm text-text-2"
    >
      {{ phrase.upload_strip_audio }}
    </div>
  </FieldToggle>

  <FieldToggle v-if="isVideo" v-model="fastConversion">
    <div
      @click="fastConversion = !fastConversion"
      :data-title-popup="phrase.upload_fast_conversion_hint"
      class="w-full cursor-pointer text-sm text-text-2"
    >
      {{ phrase.upload_fast_conversion }}
    </div>
  </FieldToggle>

  <Button
    v-if="showRecommendedButton"
    variant="secondary"
    @click="emit('applyRecommendedSettings')"
  >
    <Icon name="check-shield" class="mr-xs" />
    <span>{{ phrase.upload_recommended_settings }}</span>
  </Button>

  <Button
    variant="secondary"
    :disabled="Boolean(busyAction)"
    @click="emit('applySettings')"
  >
    <Icon
      :name="busyAction === 'apply' ? 'loading' : 'eye-open'"
      class="mr-xs"
    />
    <span>{{ applyButtonText }}</span>
  </Button>

  <UploadSettingsFileComparison
    v-if="showResult"
    include-dimensions
    :previous="previousFile"
    :current="currentFile"
  />

  <Button
    variant="primary"
    :disabled="!canUseTransformed"
    class="font-semibold"
    @click="emit('finish')"
  >
    <span>{{ phrase.upload_use }}</span>
    <Icon name="chevron-right" class="ml-xs" />
  </Button>
</template>
