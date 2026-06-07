<script lang="ts" setup>
import UploadSettingsFileComparison from './UploadSettingsFileComparison.vue';

type BusyAction = 'variants' | 'upload-original' | 'apply';

defineProps<{
  busyAction?: BusyAction;
  applyButtonText: string;
  canUseTransformed: boolean;
  showResult: boolean;
  previousFile: {
    extension?: string;
    size?: number;
  };
  currentFile: {
    extension?: string;
    size?: number;
  };
}>();

const emit = defineEmits<{
  applySettings: [];
  finish: [];
}>();
</script>

<template>
  <div class="text-sm text-text-2">
    {{ phrase.upload_compress_to_zip_hint }}
  </div>

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
    <span>{{ phrase.upload_use }}</span>
    <Icon name="chevron-right" class="ml-xs" />
  </Button>
</template>
