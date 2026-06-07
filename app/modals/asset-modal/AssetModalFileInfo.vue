<script lang="ts" setup>
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';

interface InfoBlockRow {
  label: string;
  value?: string | number | null;
  uppercase?: boolean;
}

const { size, name, extension, dimensions, archivedOriginal } = defineProps<{
  name?: string;
  extension?: string;
  size?: number;
  dimensions?: { width: number; height: number };
  archivedOriginal?: ArchivedOriginalFileMeta;
}>();

const humanSize = useHumanSize();
const formattedSize = computed(() =>
  size !== undefined ? humanSize(size) : undefined,
);
const formattedDimensions = computed(() =>
  dimensions ? `${dimensions.width} x ${dimensions.height}` : undefined,
);

const baseName = computed(() => {
  if (!name || !extension) return name;
  const suffix = '.' + extension;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
});

const rows = computed<InfoBlockRow[]>(() => [
  {
    label: phrase.value.file_info_name,
    value: baseName.value,
  },
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
