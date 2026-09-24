<script lang="ts" setup>
import type {
  InfoBlockRow,
  InfoBlockTone,
} from '#layers/thei/app/types/info-block';
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';
import { sizeShare } from './format-labels';

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
    /** The size is a guess: shown behind an ≈. */
    approximate?: boolean;
  };
}>();

const humanSize = useHumanSize();

const rows = computed<InfoBlockRow[]>(() => {
  const items: InfoBlockRow[] = [
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
      // Unknown until the result exists: say nothing rather than "empty".
      value:
        props.current.size === undefined
          ? undefined
          : {
              previous:
                props.previous.size !== undefined
                  ? humanSize(props.previous.size)
                  : undefined,
              current:
                props.current.size !== undefined
                  ? `${props.current.approximate ? '≈ ' : ''}${humanSize(props.current.size)}`
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
  return dimensions ? `${dimensions.width} × ${dimensions.height}` : undefined;
}

function sizeTone(
  previous: number | undefined,
  current: number | undefined,
): InfoBlockTone {
  return sizeShare(current, previous)?.tone ?? 'neutral';
}

function extensionTone(
  previous: string | undefined,
  current: string | undefined,
): InfoBlockTone {
  if (previous?.toLowerCase() === 'svg' && current?.toLowerCase() !== 'svg') {
    return 'bad';
  }
  return 'neutral';
}
</script>

<template>
  <InfoBlock :rows="rows" />
</template>
