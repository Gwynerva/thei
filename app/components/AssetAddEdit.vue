<script lang="ts" setup>
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const props = defineProps<{
  previewUrl?: string;
  videoUrl?: string;
  size?: number;
  isPrivate?: boolean;
  extension?: string;
}>();

const formatSize = useHumanSize();

const VIDEO_HOVER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const canHoverPlay = computed(
  () =>
    props.videoUrl &&
    (props.size == null || props.size < VIDEO_HOVER_MAX_BYTES),
);

const videoEl = useTemplateRef<HTMLVideoElement>('videoEl');

function onPointerEnter() {
  if (canHoverPlay.value) videoEl.value?.play().catch(() => {});
}

function onPointerLeave() {
  const el = videoEl.value;
  if (!el) return;
  el.pause();
  el.currentTime = 0;
}
</script>

<template>
  <!-- Filled / extension state -->
  <div
    v-if="previewUrl || extension"
    v-bind="attrs"
    class="group relative overflow-clip rounded-normal border-2 border-border-1
      bg-bg-1 transition hocus:border-border-3"
    :class="{ 'flex items-center justify-center': !previewUrl }"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <!-- Media content -->
    <video
      v-if="videoUrl"
      ref="videoEl"
      :src="videoUrl"
      :poster="previewUrl"
      muted
      loop
      playsinline
      class="size-full object-cover"
    />
    <img
      v-else-if="previewUrl"
      :src="previewUrl"
      class="size-full object-cover"
      alt=""
    />
    <span v-else class="truncate p-1 text-center text-lg font-bold text-text-2">
      {{ extension!.toUpperCase() }}
    </span>

    <!-- Lock badge (top-left) -->
    <div
      v-if="isPrivate"
      class="absolute top-1 left-1 rounded-full bg-black/30 p-1 text-xs
        text-white backdrop-blur-sm"
    >
      <Icon name="lock-close" />
    </div>

    <!-- Video badge (top-right) -->
    <div
      v-if="videoUrl"
      class="absolute top-1 right-1 rounded-full bg-black/30 p-1 text-xs
        leading-none text-white backdrop-blur-sm"
    >
      <Icon name="play-circle" />
    </div>

    <!-- Size badge (bottom-center) -->
    <div
      v-if="size != null"
      class="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/30 p-1
        text-xs leading-none text-white backdrop-blur-sm"
    >
      {{ formatSize(size) }}
    </div>

    <!-- Hover overlay -->
    <div
      class="absolute inset-0 flex items-center justify-center bg-bg-1/60
        opacity-0 transition group-hocus:opacity-100"
    >
      <Icon name="edit" class="text-2xl text-text-1" />
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else
    v-bind="attrs"
    class="flex items-center justify-center overflow-clip rounded-normal
      border-2 border-border-1 bg-bg-1 transition hocus:border-border-3
      hocus:bg-bg-3"
  >
    <Icon name="plus" class="text-3xl text-text-2" />
  </div>
</template>
