<script lang="ts" setup>
import type { InfoBlockRow } from '#layers/thei/app/types/info-block';
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';
import { formatMediaTime } from '#layers/thei/shared/audio';

const {
  size,
  extension,
  dimensions,
  duration,
  channels,
  bitrate,
  archivedOriginal,
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
}>();

const humanSize = useHumanSize();
const formattedSize = computed(() =>
  size !== undefined ? humanSize(size) : undefined,
);
const formattedDimensions = computed(() =>
  dimensions ? `${dimensions.width} × ${dimensions.height}` : undefined,
);
const formattedDuration = computed(() =>
  duration !== undefined && duration > 0
    ? formatMediaTime(Math.round(duration))
    : undefined,
);

const rows = computed<InfoBlockRow[]>(() => [
  {
    label: phrase.value.file_info_extension,
    value: extension,
    uppercase: true,
  },
  {
    label: phrase.value.file_info_size,
    value: formattedSize.value,
  },
  {
    label: phrase.value.file_info_dimensions,
    value: formattedDimensions.value,
  },
  {
    label: phrase.value.file_info_duration,
    value: formattedDuration.value,
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
    value: archivedOriginal?.extension,
    uppercase: true,
  },
  {
    label: phrase.value.file_info_archived_size,
    value:
      archivedOriginal?.size !== undefined
        ? humanSize(archivedOriginal.size)
        : undefined,
  },
]);
</script>

<template>
  <InfoBlock :rows="rows" />
</template>
