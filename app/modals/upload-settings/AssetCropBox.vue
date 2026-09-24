<script lang="ts" setup>
import {
  CROP_CORNER_HANDLES,
  CROP_EDGE_HANDLES,
  maximizeCropRect,
  moveCropRect,
  resizeCropRect,
  type AssetCropFraction,
  type CropHandle,
  type CropRectF,
} from '#layers/thei/shared/asset-crop';
import type { FileDimensions } from '#layers/thei/shared/asset-upload-dimensions';

/**
 * A crop frame laid over media shown by `AssetModalPreviewMedia`.
 *
 * It fills the media box and places the frame in percent of it, so zoom and
 * pan need no maths here: the box already follows them. Drags are measured
 * against the box's size on screen and turned into source pixels, which is
 * what the stored recipe names.
 */
const props = defineProps<{
  /** Pixel size of the source the crop applies to. */
  source: FileDimensions;
  /** Width over height the crop keeps; free when absent. */
  aspect?: number;
  /** A circle is only a guide: the stored file stays rectangular. */
  shape?: 'rect' | 'circle';
  disabled?: boolean;
}>();

const crop = defineModel<AssetCropFraction>({ required: true });

const root = useTemplateRef<HTMLElement>('root');
const dragging = ref(false);

interface Drag {
  mode: 'move' | CropHandle;
  pointerId: number;
  x: number;
  y: number;
  start: CropRectF;
  /** Source pixels per screen pixel, at the zoom the drag started with. */
  scaleX: number;
  scaleY: number;
}
let drag: Drag | null = null;

const handles = computed(() =>
  props.aspect
    ? CROP_CORNER_HANDLES
    : [...CROP_CORNER_HANDLES, ...CROP_EDGE_HANDLES],
);

const frameStyle = computed(() => ({
  left: `${crop.value.left * 100}%`,
  top: `${crop.value.top * 100}%`,
  width: `${crop.value.width * 100}%`,
  height: `${crop.value.height * 100}%`,
}));

const pixelSize = computed(() => {
  const width = Math.round(crop.value.width * props.source.width);
  const height = Math.round(crop.value.height * props.source.height);
  return `${width} × ${height}`;
});

const HANDLE_POSITION: Record<CropHandle, string> = {
  nw: 'top-0 left-0 cursor-nwse-resize',
  ne: 'top-0 left-full cursor-nesw-resize',
  sw: 'top-full left-0 cursor-nesw-resize',
  se: 'top-full left-full cursor-nwse-resize',
  n: 'top-0 left-1/2 cursor-ns-resize',
  s: 'top-full left-1/2 cursor-ns-resize',
  w: 'top-1/2 left-0 cursor-ew-resize',
  e: 'top-1/2 left-full cursor-ew-resize',
};

function toPixels(fraction: AssetCropFraction): CropRectF {
  return {
    left: fraction.left * props.source.width,
    top: fraction.top * props.source.height,
    width: fraction.width * props.source.width,
    height: fraction.height * props.source.height,
  };
}

function toFraction(rect: CropRectF): AssetCropFraction {
  return {
    left: rect.left / props.source.width,
    top: rect.top / props.source.height,
    width: rect.width / props.source.width,
    height: rect.height / props.source.height,
  };
}

function startDrag(event: PointerEvent, mode: Drag['mode']) {
  if (props.disabled || drag || event.button > 0) return;
  // The preview pans and pinches on the same pointers; a drag that starts on
  // the frame belongs to the frame alone.
  event.stopPropagation();
  event.preventDefault();
  const box = root.value?.getBoundingClientRect();
  if (!box?.width || !box.height) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  drag = {
    mode,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    start: toPixels(crop.value),
    scaleX: props.source.width / box.width,
    scaleY: props.source.height / box.height,
  };
  dragging.value = true;
}

function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.stopPropagation();
  const dx = (event.clientX - drag.x) * drag.scaleX;
  const dy = (event.clientY - drag.y) * drag.scaleY;
  crop.value = toFraction(
    drag.mode === 'move'
      ? moveCropRect(drag.start, dx, dy, props.source)
      : resizeCropRect(
          drag.start,
          drag.mode,
          dx,
          dy,
          props.source,
          props.aspect,
        ),
  );
}

function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.stopPropagation();
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  drag = null;
  dragging.value = false;
}

function maximize() {
  if (props.disabled) return;
  crop.value = toFraction(maximizeCropRect(props.source, props.aspect));
}

function nudge(event: KeyboardEvent) {
  const step = event.shiftKey ? 10 : 1;
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const move = delta[event.key];
  if (!move || props.disabled) return;
  event.preventDefault();
  crop.value = toFraction(
    moveCropRect(toPixels(crop.value), move[0], move[1], props.source),
  );
}
</script>

<template>
  <div
    ref="root"
    class="absolute inset-0"
    :class="disabled ? 'pointer-events-none' : ''"
  >
    <!-- The shade is clipped to the media; the frame and its handles are
         not, so a handle on the edge of the picture stays whole. -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        class="crop-shade absolute"
        :class="shape === 'circle' ? 'rounded-full' : ''"
        :style="frameStyle"
      ></div>
    </div>
    <div
      class="absolute touch-none outline-none focus-visible:ring-2
        focus-visible:ring-accent"
      :class="disabled ? '' : 'cursor-move'"
      :style="frameStyle"
      role="group"
      tabindex="0"
      :aria-label="`${phrase.upload_crop_area}: ${pixelSize}`"
      @pointerdown="startDrag($event, 'move')"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @dblclick="maximize"
      @keydown="nudge"
    >
      <div
        class="pointer-events-none absolute inset-0 border border-white/90"
        :class="shape === 'circle' ? 'border-dashed border-white/60' : ''"
      ></div>
      <div
        v-if="shape === 'circle'"
        class="pointer-events-none absolute inset-0 rounded-full border-2
          border-white/90"
      ></div>

      <div
        v-if="dragging"
        class="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <span class="absolute inset-y-0 left-1/3 w-px bg-white/40"></span>
        <span class="absolute inset-y-0 left-2/3 w-px bg-white/40"></span>
        <span class="absolute inset-x-0 top-1/3 h-px bg-white/40"></span>
        <span class="absolute inset-x-0 top-2/3 h-px bg-white/40"></span>
        <span
          class="absolute top-xs left-xs rounded-sm bg-black/60 px-xs py-0.5
            text-xs font-semibold text-white tabular-nums"
        >
          {{ pixelSize }}
        </span>
      </div>

      <template v-if="!disabled">
        <span
          v-for="handle in handles"
          :key="handle"
          class="absolute flex size-8 -translate-x-1/2 -translate-y-1/2
            touch-none items-center justify-center pointer-coarse:size-11"
          :class="HANDLE_POSITION[handle]"
          :aria-label="phrase.upload_crop_handle"
          @pointerdown="startDrag($event, handle)"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <span
            class="size-3 rounded-full border-2 border-accent bg-white shadow-md
              shadow-shadow-3 pointer-coarse:size-4"
          ></span>
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* The shade outside the crop: one shadow spread past the media box, clipped
   by it, so the frame can be any shape — a circle for an avatar included. */
.crop-shade {
  box-shadow: 0 0 0 100vmax
    color-mix(in oklab, var(--color-black) 55%, transparent);
}
</style>
