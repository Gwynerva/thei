<script lang="ts" setup>
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';
import { SIZE_SHARE_CLASS, sizeShare } from './format-labels';
import UploadSettingsFileComparison from './UploadSettingsFileComparison.vue';

interface ResultFile {
  extension?: string;
  size?: number;
  dimensions?: FileDimensions;
  /** The size is a guess, until the file exists. */
  approximate?: boolean;
}

/**
 * What the chosen settings produce, next to the source they come from.
 *
 * For an image this is the exact file "Use" would store, encoded ahead; for
 * a video it is an estimate until the variant is created, and then the
 * variant itself.
 */
const props = defineProps<{
  pending?: boolean;
  error?: string;
  source: ResultFile;
  result?: ResultFile;
  includeDimensions?: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const share = computed(() => sizeShare(props.result?.size, props.source.size));
const approximate = computed(() => Boolean(props.result?.approximate));
</script>

<template>
  <div class="flex flex-col gap-xs" aria-live="polite">
    <div class="flex items-center gap-xs text-sm">
      <span class="font-semibold text-text-2">{{ phrase.upload_result }}</span>
      <span class="h-px grow bg-border-1" aria-hidden="true"></span>
      <span
        v-if="pending"
        class="flex items-center gap-1 text-xs text-text-3"
        role="status"
      >
        <Icon name="loading" />
        {{ phrase.upload_result_pending }}
      </span>
      <span
        v-else-if="share"
        class="text-xs font-semibold tabular-nums"
        :class="SIZE_SHARE_CLASS[share.tone]"
      >
        {{ approximate ? '≈ ' : '' }}
        {{ phrase.upload_result_of_source(share.text) }}
      </span>
    </div>
    <button
      v-if="error && !pending"
      type="button"
      class="flex cursor-pointer items-center gap-xs text-left text-sm
        text-text-error"
      @click="emit('retry')"
    >
      <Icon name="warning" class="shrink-0" />
      <span>{{ error }}</span>
    </button>
    <UploadSettingsFileComparison
      v-if="result"
      :include-dimensions="includeDimensions"
      :previous="source"
      :current="result"
      :class="pending ? 'opacity-50' : ''"
    />
    <slot></slot>
  </div>
</template>
