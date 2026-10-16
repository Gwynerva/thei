<script lang="ts" setup>
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';
import { formatMediaTime } from '#layers/thei/shared/audio';

/**
 * What a file is, in a grid of facts, each label over its value: a few
 * short cells side by side, on a phone as on a desktop, instead of a column
 * of rows a label wide.
 */
const {
  size,
  extension,
  dimensions,
  duration,
  channels,
  bitrate,
  archivedOriginal,
  pending,
} = defineProps<{
  extension?: string;
  size?: number;
  dimensions?: FileDimensions;
  /** Seconds of a video or a recording. */
  duration?: number;
  /** Of a recording's sound. */
  channels?: number;
  /** Bits per second of a recording's sound. */
  bitrate?: number;
  archivedOriginal?: ArchivedOriginalFileMeta;
  /** The file is still being fetched: what every file has waits in place. */
  pending?: boolean;
}>();

const humanSize = useHumanSize();

const facts = computed(() =>
  [
    {
      label: phrase.value.file_info_extension,
      value: extension?.toUpperCase(),
      always: true,
    },
    {
      label: phrase.value.file_info_size,
      value: size !== undefined ? humanSize(size) : undefined,
      always: true,
    },
    {
      label: phrase.value.file_info_dimensions,
      value: dimensions
        ? `${dimensions.width} × ${dimensions.height}`
        : undefined,
    },
    {
      label: phrase.value.file_info_duration,
      value:
        duration !== undefined && duration > 0
          ? formatMediaTime(duration)
          : undefined,
    },
    {
      label: phrase.value.file_info_channels,
      value: channels ? phrase.value.audio_channel_count(channels) : undefined,
    },
    {
      label: phrase.value.file_info_bitrate,
      value: bitrate
        ? phrase.value.asset_recipe_bitrate(Math.round(bitrate / 1000))
        : undefined,
    },
    {
      label: phrase.value.file_info_archived_extension,
      value: archivedOriginal?.extension.toUpperCase(),
    },
    {
      label: phrase.value.file_info_archived_size,
      value:
        archivedOriginal?.size !== undefined
          ? humanSize(archivedOriginal.size)
          : undefined,
    },
  ].filter((fact) => fact.value !== undefined || (pending && fact.always)),
);
</script>

<template>
  <dl class="m-0 grid grid-cols-3 gap-x-xs gap-y-2" data-file-facts>
    <div v-for="fact in facts" :key="fact.label" class="flex min-w-0 flex-col">
      <dt class="truncate text-2xs text-text-3">{{ fact.label }}</dt>
      <dd
        v-if="fact.value !== undefined"
        class="m-0 truncate text-sm font-semibold tabular-nums"
      >
        {{ fact.value }}
      </dd>
      <dd
        v-else
        class="m-0 h-lh w-3/4 animate-pulse rounded-normal bg-bg-3 text-sm
          motion-reduce:animate-none"
        aria-hidden="true"
      ></dd>
    </div>
  </dl>
</template>
