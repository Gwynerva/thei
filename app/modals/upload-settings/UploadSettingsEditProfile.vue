<script lang="ts" setup>
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
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
const muteAudio = defineModel<boolean>('muteAudio', { required: true });
const videoConversionMode = defineModel<'quality' | 'fast'>(
  'videoConversionMode',
  { required: true },
);

defineProps<{
  isVideo: boolean;
  qualityValues: number[];
  videoModeOptions: FieldOptions;
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
    :format="(value) => `${value} %`"
    class="-mt-3"
  >
    <template #before>
      <div class="relative -top-3 text-sm leading-0 tracking-tight text-text-2">
        Качество
      </div>
    </template>
  </FieldSlider>

  <div class="flex flex-col gap-xs text-sm text-text-2">
    <div class="flex min-w-0 flex-col gap-xs">
      <div>Ширина</div>
      <FieldInput
        v-model="widthInput"
        inputmode="numeric"
        type="text"
        class="min-w-2! p-2!"
        @blur="emit('syncHeightFromWidth')"
        @submit="emit('syncHeightFromWidth')"
      />
    </div>
    <button
      class="cursor-pointer self-center p-1 text-lg transition"
      :class="
        keepAspect
          ? 'text-accent hocus:text-accent'
          : 'text-text-3 hocus:text-text-1'
      "
      @click="keepAspect = !keepAspect"
    >
      <Icon name="link" />
    </button>
    <div class="flex min-w-0 flex-col gap-xs">
      <div>Высота</div>
      <FieldInput
        v-model="heightInput"
        inputmode="numeric"
        type="text"
        class="min-w-2! p-2!"
        @blur="emit('syncWidthFromHeight')"
        @submit="emit('syncWidthFromHeight')"
      />
    </div>
  </div>

  <Button variant="secondary" @click="emit('applyRecommendedSettings')">
    <Icon name="check-shield" class="mr-xs" />
    <span>Рекомендуемые настройки</span>
  </Button>

  <FieldToggle v-if="isVideo" v-model="muteAudio">
    <template #inactive>С аудио</template>
    <template #active>Без аудио</template>
  </FieldToggle>

  <FieldOptions
    v-if="isVideo"
    v-model="videoConversionMode"
    :options="videoModeOptions"
  />

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
    :previous="previousFile"
    :current="currentFile"
  />

  <Button
    variant="primary"
    :disabled="!canUseTransformed"
    class="font-semibold"
    @click="emit('finish')"
  >
    <span>Использовать</span>
    <Icon name="chevron-right" class="ml-xs" />
  </Button>
</template>
