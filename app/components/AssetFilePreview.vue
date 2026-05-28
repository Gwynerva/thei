<script lang="ts" setup>
/**
 * Local-file preview shown before an asset is uploaded.
 *
 * - Images  → <img> with an object URL
 * - Videos  → <video controls muted> with an object URL
 * - Others  → large extension text (like AssetAddEdit extension state)
 *
 * The object URL is created on mount and revoked on unmount.
 * Callers place the action button (Upload / etc.) below this component.
 */
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '#layers/thei/shared/asset';

const props = defineProps<{ file: File; showReplace?: boolean }>();
const emit = defineEmits<{ replace: [] }>();

const formatSize = useHumanSize();

const ext = computed(() => {
  const dot = props.file.name.lastIndexOf('.');
  return dot >= 0 ? props.file.name.slice(dot + 1).toLowerCase() : '';
});

const isImage = computed(() =>
  (IMAGE_EXTENSIONS as readonly string[]).includes(ext.value),
);
const isVideo = computed(() =>
  (VIDEO_EXTENSIONS as readonly string[]).includes(ext.value),
);

const objectUrl = shallowRef<string | undefined>();

watchEffect((onCleanup) => {
  if (isImage.value || isVideo.value) {
    const url = URL.createObjectURL(props.file);
    objectUrl.value = url;
    onCleanup(() => {
      URL.revokeObjectURL(url);
      objectUrl.value = undefined;
    });
  }
});
</script>

<template>
  <!-- Visual preview -->
  <div class="overflow-hidden rounded-normal border border-border-1 bg-bg-1">
    <img
      v-if="isImage && objectUrl"
      :src="objectUrl"
      class="max-h-[40vh] w-full object-contain"
      alt=""
    />
    <video
      v-else-if="isVideo && objectUrl"
      :src="objectUrl"
      controls
      muted
      playsinline
      class="max-h-[40vh] w-full bg-black"
    />
    <div v-else class="flex h-40 items-center justify-center">
      <span class="px-md text-center text-5xl font-bold break-all text-text-2">
        {{ ext ? ext.toUpperCase() : '?' }}
      </span>
    </div>
  </div>

  <!-- Extension + size + optional replace button -->
  <div class="flex items-center gap-sm text-sm text-text-2">
    <span v-if="ext" class="font-mono font-semibold uppercase">{{ ext }}</span>
    <span>{{ formatSize(file.size) }}</span>
    <Button
      v-if="showReplace"
      variant="secondary"
      class="ml-auto"
      @click="emit('replace')"
    >
      {{ phrase.asset_replace }}
    </Button>
  </div>
</template>
