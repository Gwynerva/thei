<script lang="ts" setup>
interface FileDimensions {
  width: number;
  height: number;
}

const props = defineProps<{
  previous: {
    extension?: string;
    size?: number;
    dimensions?: FileDimensions;
  };
  current: {
    extension?: string;
    size?: number;
    dimensions?: FileDimensions;
  };
}>();

const humanSize = useHumanSize();

const rows = computed(() => [
  {
    label: 'Extension',
    previous: props.previous.extension,
    current: props.current.extension,
    uppercase: true,
  },
  {
    label: 'Size',
    previous:
      props.previous.size !== undefined
        ? humanSize(props.previous.size)
        : undefined,
    current:
      props.current.size !== undefined
        ? humanSize(props.current.size)
        : undefined,
  },
  {
    label: 'Dimensions',
    previous: formatDimensions(props.previous.dimensions),
    current: formatDimensions(props.current.dimensions),
  },
]);

function formatDimensions(dimensions: FileDimensions | undefined) {
  return dimensions ? `${dimensions.width}x${dimensions.height}` : undefined;
}
</script>

<template>
  <div class="flex flex-col text-sm tracking-tight text-text-2">
    <div
      v-for="row in rows"
      :key="row.label"
      class="flex justify-between gap-sm"
    >
      <div class="shrink-0">{{ row.label }}</div>
      <div class="flex min-w-0 items-center justify-end gap-1 font-semibold">
        <span
          class="min-w-0 truncate text-xs font-medium text-text-3"
          :class="row.uppercase ? 'uppercase' : ''"
        >
          {{ row.previous || '-' }}
        </span>
        <Icon name="chevron-right" class="shrink-0 text-xs text-text-3" />
        <span
          class="min-w-0 truncate"
          :class="row.uppercase ? 'uppercase' : ''"
        >
          <template v-if="row.current">{{ row.current }}</template>
          <em v-else class="opacity-50">empty</em>
        </span>
      </div>
    </div>
  </div>
</template>
