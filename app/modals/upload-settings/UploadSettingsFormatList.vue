<script lang="ts" setup>
import { SIZE_SHARE_CLASS, sizeShare } from './format-labels';
import type { FormatChoice } from './use-edit-settings';

export interface UploadSettingsFormatOption {
  value: FormatChoice;
  label: string;
  /** Why "Auto" picked what it picked. */
  detail?: string;
  /** Exact size of the result in this format, once encoded. */
  size?: number;
  pending?: boolean;
  failed?: boolean;
  /** Not to be had with the current settings, for the reason in `hint`. */
  disabled?: boolean;
  hint?: string;
}

/**
 * The output formats, one per row, each with the exact size the current
 * settings produce in it — so the choice is made on real numbers.
 */
const props = defineProps<{
  options: UploadSettingsFormatOption[];
  /** Size of the source, to put each result's size against. */
  sourceSize?: number;
  disabled?: boolean;
}>();

const model = defineModel<FormatChoice>({ required: true });
const humanSize = useHumanSize();
const share = (size: number) => sizeShare(size, props.sourceSize);
</script>

<template>
  <div
    class="flex flex-col gap-1 rounded-normal bg-bg-3 p-1 text-sm"
    role="radiogroup"
    :aria-label="phrase.upload_format"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :disabled="disabled || option.disabled"
      :data-title-popup="option.hint"
      class="flex cursor-pointer items-center justify-between gap-sm
        rounded-normal border-2 px-xs py-1.5 text-left transition
        disabled:cursor-default"
      :class="[
        model === option.value
          ? 'border-accent bg-bg-accent text-accent'
          : `border-border-1 bg-bg-1 text-text-2 hocus:border-border-3
            hocus:text-text-1`,
        option.disabled ? 'opacity-50' : '',
      ]"
      @click="model = option.value"
    >
      <span class="flex min-w-0 flex-col">
        <span class="font-semibold">{{ option.label }}</span>
        <span v-if="option.detail" class="text-xs text-text-3">
          {{ option.detail }}
        </span>
      </span>
      <span class="flex shrink-0 items-center gap-xs text-xs tabular-nums">
        <Icon v-if="option.pending" name="loading" class="text-text-3" />
        <Icon
          v-else-if="option.failed"
          name="warning"
          class="text-text-error"
        />
        <template v-else-if="option.size !== undefined">
          <span>{{ humanSize(option.size) }}</span>
          <span
            v-if="share(option.size)"
            :class="SIZE_SHARE_CLASS[share(option.size)!.tone]"
          >
            {{ share(option.size)!.text }}
          </span>
        </template>
      </span>
    </button>
  </div>
</template>
