<script lang="ts" setup>
import type { InfoBlockRow } from '#layers/thei/app/types/info-block';
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';

const { size, extension, dimensions, duration, archivedOriginal } =
  defineProps<{
    extension?: string;
    size?: number;
    dimensions?: FileDimensions;
    /** Seconds of a video. */
    duration?: number;
    archivedOriginal?: ArchivedOriginalFileMeta;
  }>();

const humanSize = useHumanSize();
const formattedSize = computed(() =>
  size !== undefined ? humanSize(size) : undefined,
);
const formattedDimensions = computed(() =>
  dimensions ? `${dimensions.width} × ${dimensions.height}` : undefined,
);
/** Minutes and seconds, with an hour in front when there is one. */
const formattedDuration = computed(() => {
  if (duration === undefined || !(duration > 0)) return undefined;
  const whole = Math.round(duration);
  const seconds = String(whole % 60).padStart(2, '0');
  const minutes = Math.floor(whole / 60) % 60;
  const hours = Math.floor(whole / 3600);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
});

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
