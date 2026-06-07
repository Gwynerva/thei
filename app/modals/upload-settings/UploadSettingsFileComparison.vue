<script lang="ts" setup>
interface FileDimensions {
  width: number;
  height: number;
}

const props = defineProps<{
  includeDimensions?: boolean;
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

const rows = computed(() => {
  const items = [
    {
      label: phrase.value.file_info_extension,
      value: {
        previous: props.previous.extension,
        current: props.current.extension,
        tone: extensionTone(props.previous.extension, props.current.extension),
      },
      uppercase: true,
    },
    {
      label: phrase.value.file_info_size,
      value: {
        previous:
          props.previous.size !== undefined
            ? humanSize(props.previous.size)
            : undefined,
        current:
          props.current.size !== undefined
            ? humanSize(props.current.size)
            : undefined,
        tone: sizeTone(props.previous.size, props.current.size),
      },
    },
  ];

  if (props.includeDimensions) {
    items.push({
      label: phrase.value.file_info_dimensions,
      value: [
        formatDimensions(props.previous.dimensions),
        formatDimensions(props.current.dimensions),
      ],
    });
  }

  return items;
});

function formatDimensions(dimensions: FileDimensions | undefined) {
  return dimensions ? `${dimensions.width}x${dimensions.height}` : undefined;
}

function sizeTone(previous: number | undefined, current: number | undefined) {
  if (previous === undefined || current === undefined || previous === current) {
    return 'neutral';
  }
  return current < previous ? 'good' : 'bad';
}

function extensionTone(previous: string | undefined, current: string | undefined) {
  if (previous?.toLowerCase() === 'svg' && current?.toLowerCase() !== 'svg') {
    return 'bad';
  }
  return 'neutral';
}
</script>

<template>
  <InfoBlock :rows="rows" />
</template>
