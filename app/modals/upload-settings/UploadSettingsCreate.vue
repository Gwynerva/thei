<script lang="ts" setup>
import type { AssetQualityStop } from '#layers/thei/shared/asset-quality-levels';
import {
  ASSET_SIZE_PRESETS,
  type FileDimensions,
} from '#layers/thei/shared/asset-upload-dimensions';
import type { DiscreteBarStop } from '../../components/field/discrete-bar-stops';
import type { FieldOptions } from '../../components/field/FieldOptions.vue';
import UploadSettingsFormatList, {
  type UploadSettingsFormatOption,
} from './UploadSettingsFormatList.vue';
import type { CropAspectChoice, FormatChoice } from './use-edit-settings';

const qualityLevel = defineModel<AssetQualityStop>('qualityLevel', {
  required: true,
});
/** The bar deals in plain strings; the stops it is given are the levels. */
const levelModel = computed<string>({
  get: () => qualityLevel.value,
  set: (stop) => {
    qualityLevel.value = stop as AssetQualityStop;
  },
});
const formatChoice = defineModel<FormatChoice>('formatChoice', {
  required: true,
});
const stripAudio = defineModel<boolean>('stripAudio', { required: true });
const fastConversion = defineModel<boolean>('fastConversion', {
  required: true,
});
/** The sound as a setting that is on or off, over the recipe's "strip it". */
const keepAudio = computed<boolean>({
  get: () => !stripAudio.value,
  set: (keep) => {
    stripAudio.value = !keep;
  },
});

/**
 * Settings for a new variant, one block per step in the order they are
 * applied: turn, crop, size, then format and quality. The crop and the size
 * carry their own reset; it keeps its place while hidden, so a heading does
 * not jump as a drag of the frame makes it come and go.
 */
const props = defineProps<{
  kind: 'image' | 'video';
  disabled?: boolean;
  /** Clockwise quarter turns, in degrees. */
  rotation: number;
  aspectChoice: CropAspectChoice;
  /** The crop frame is out for editing. */
  cropping: boolean;
  canResetCrop: boolean;
  /** Why the frame keeps its proportions, when the place fixes them. */
  lockedTitle?: string;
  /** Size of the crop: the largest output there can be. */
  cropSize?: FileDimensions;
  output?: FileDimensions;
  /** The output keeps the crop's proportions. */
  linked: boolean;
  canResetSize: boolean;
  /** Formats to choose from, each with its size; empty when the place fixes one. */
  formatOptions: UploadSettingsFormatOption[];
  sourceSize?: number;
  /** The quality stops, each with the size it comes out at. */
  qualityStops: DiscreteBarStop[];
  /** The chosen stop's size with its unit. */
  qualityDetail?: string;
  /** A vector kept a vector: no quality to choose. */
  vectorKept: boolean;
  /** `false` only when a video is known to be silent. */
  sourceHasAudio?: boolean;
}>();

const emit = defineEmits<{
  rotate: [];
  aspect: [choice: CropAspectChoice];
  toggleCrop: [];
  resetCrop: [];
  outputWidth: [width: number | undefined];
  outputHeight: [height: number | undefined];
  outputLongSide: [longSide: number | undefined];
  linked: [linked: boolean];
  resetSize: [];
}>();

const CHIP =
  'flex cursor-pointer items-center gap-1 rounded-normal bg-bg-3 px-2 py-1 ' +
  'text-xs text-text-2 transition disabled:cursor-default ' +
  'disabled:opacity-50 hocus:bg-accent/50 hocus:text-text-1';

/** A reset that holds its place while there is nothing to reset. */
const resetClass = (enabled: boolean) => [CHIP, enabled ? '' : 'invisible'];

const aspectOptions = computed<FieldOptions>(() => ({
  free: { title: phrase.value.upload_crop_free },
  source: { title: phrase.value.upload_crop_source },
  '1:1': { title: '1:1' },
  '4:3': { title: '4:3' },
  '3:2': { title: '3:2' },
  '16:9': { title: '16:9' },
}));
const aspectModel = computed({
  get: () => props.aspectChoice,
  set: (choice: string) => emit('aspect', choice as CropAspectChoice),
});

const cropLongSide = computed(() =>
  props.cropSize ? Math.max(props.cropSize.width, props.cropSize.height) : 0,
);
const sizePresets = computed(() =>
  ASSET_SIZE_PRESETS.filter((preset) => preset < cropLongSide.value),
);
const outputLongSide = computed(() =>
  props.output ? Math.max(props.output.width, props.output.height) : 0,
);

const widthInput = ref('');
const heightInput = ref('');
watch(
  () => props.output,
  (output) => {
    widthInput.value = output ? String(output.width) : '';
    heightInput.value = output ? String(output.height) : '';
  },
  { immediate: true },
);

function commitWidth() {
  const width = parsePositive(widthInput.value);
  if (width === props.output?.width) return;
  emit('outputWidth', width);
}

function commitHeight() {
  const height = parsePositive(heightInput.value);
  if (height === props.output?.height) return;
  emit('outputHeight', height);
}

function parsePositive(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
</script>

<template>
  <fieldset :disabled="disabled" class="flex min-w-0 flex-col gap-sm">
    <div class="flex items-center gap-xs">
      <span class="grow text-sm text-text-2">{{ phrase.upload_rotation }}</span>
      <span class="text-sm text-text-3 tabular-nums">{{ rotation }}°</span>
      <button
        type="button"
        :class="CHIP"
        :aria-label="phrase.upload_rotate"
        :data-title-popup="phrase.upload_rotate"
        @click="emit('rotate')"
      >
        <Icon name="rotate-right" />
      </button>
    </div>

    <div class="flex flex-col gap-xs">
      <div class="flex items-center gap-xs">
        <span class="grow text-sm text-text-2">{{ phrase.upload_crop }}</span>
        <button
          type="button"
          :class="resetClass(canResetCrop)"
          :disabled="!canResetCrop"
          @click="emit('resetCrop')"
        >
          {{ phrase.upload_reset }}
        </button>
        <span
          v-if="lockedTitle"
          class="flex text-text-3"
          :aria-label="lockedTitle"
          :data-title-popup="lockedTitle"
        >
          <Icon name="lock-close" />
        </span>
        <FieldToggle
          v-else
          :model-value="cropping"
          :switch-label="phrase.upload_crop"
          @update:model-value="emit('toggleCrop')"
        />
      </div>
      <FieldOptions
        v-if="cropping && !lockedTitle"
        v-model="aspectModel"
        :options="aspectOptions"
        classes="text-xs"
      />
      <p v-if="cropping && !lockedTitle" class="text-xs text-text-3">
        {{ phrase.upload_crop_hint }}
      </p>
    </div>

    <div v-if="kind === 'video'" class="flex items-center gap-xs">
      <span class="grow text-sm text-text-2">{{ phrase.upload_audio }}</span>
      <span
        v-if="sourceHasAudio === false"
        class="flex items-center gap-1 text-sm text-text-3"
        :data-title-popup="phrase.upload_source_no_audio"
      >
        <Icon name="volume-off" class="shrink-0" />
        {{ phrase.upload_audio_none }}
      </span>
      <FieldToggle
        v-else
        v-model="keepAudio"
        :switch-label="phrase.upload_audio"
      />
    </div>

    <div class="flex flex-col gap-xs">
      <div class="flex items-center gap-xs">
        <span class="grow text-sm text-text-2">{{ phrase.upload_resize }}</span>
        <button
          type="button"
          :class="resetClass(canResetSize)"
          :disabled="!canResetSize"
          @click="emit('resetSize')"
        >
          {{ phrase.upload_reset }}
        </button>
      </div>
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-xs text-sm">
        <FieldInput
          v-model="widthInput"
          inputmode="numeric"
          type="text"
          :aria-label="phrase.upload_resize_width"
          class="min-w-2! p-2! tabular-nums"
          @blur="commitWidth"
          @submit="commitWidth"
        />
        <button
          type="button"
          class="flex size-8 cursor-pointer items-center justify-center
            rounded-normal transition hocus:bg-accent/50 hocus:text-text-1"
          :class="linked ? 'text-accent' : 'text-text-3'"
          :aria-pressed="linked"
          :aria-label="phrase.upload_resize_linked"
          :data-title-popup="phrase.upload_resize_linked"
          @click="emit('linked', !linked)"
        >
          <Icon :name="linked ? 'link' : 'link-broken'" />
        </button>
        <FieldInput
          v-model="heightInput"
          inputmode="numeric"
          type="text"
          :aria-label="phrase.upload_resize_height"
          class="min-w-2! p-2! tabular-nums"
          @blur="commitHeight"
          @submit="commitHeight"
        />
      </div>
      <div
        v-if="sizePresets.length"
        class="flex flex-wrap items-center gap-px text-xs"
      >
        <button
          v-for="size of sizePresets"
          :key="size"
          type="button"
          class="cursor-pointer px-2 py-1 tabular-nums transition
            first:rounded-l-normal last:rounded-r-normal hocus:bg-accent/50
            hocus:text-text-1"
          :class="
            linked && outputLongSide === size
              ? 'bg-bg-accent text-accent'
              : 'bg-bg-3 text-text-2'
          "
          @click="emit('outputLongSide', size)"
        >
          {{ size }}
        </button>
      </div>
    </div>

    <div v-if="formatOptions.length" class="flex flex-col gap-xs">
      <span class="text-sm text-text-2">{{ phrase.upload_format }}</span>
      <UploadSettingsFormatList
        v-model="formatChoice"
        :options="formatOptions"
        :source-size="sourceSize"
        :disabled="disabled"
      />
    </div>

    <FieldDiscreteBar
      v-if="!vectorKept"
      v-model="levelModel"
      :stops="qualityStops"
      :label="phrase.upload_quality"
      :title="phrase.upload_quality"
      :detail="qualityDetail"
      :disabled="disabled"
    />

    <FieldToggle v-if="kind === 'video'" v-model="fastConversion">
      <div
        class="w-full cursor-pointer text-sm text-text-2"
        :data-title-popup="phrase.upload_fast_conversion_hint"
        @click="fastConversion = !fastConversion"
      >
        {{ phrase.upload_fast_conversion }}
      </div>
    </FieldToggle>
  </fieldset>
</template>
