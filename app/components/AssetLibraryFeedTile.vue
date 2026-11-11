<script setup lang="ts">
import type { AssetLibraryItem } from '#layers/thei/shared/asset-library';
import { assetFileLabel } from '../composables/asset-library-labels';

/**
 * One file of the library's run (`AssetLibraryFeed`): a click or Enter takes
 * it as it is, Space looks at it. Where a file can be taken otherwise — a
 * new variant, a crop — a round button at the top of the tile opens the
 * editor, shown only under the pointer and on keyboard focus; under a
 * finger a long press on the tile does.
 */
const props = defineProps<{
  item: AssetLibraryItem;
  /** Chosen or not; unset where files are not chosen. */
  selected?: boolean;
  busy?: boolean;
  editable?: boolean;
  title?: string;
}>();
const emit = defineEmits<{
  choose: [];
  edit: [];
  key: [event: KeyboardEvent];
}>();
const engaged = ref(false);

/**
 * A finger has no pointer to show the edit button under, so a long press on
 * the tile opens the editor instead. The long press is the hint's elsewhere
 * (`press-hint.ts`); a tile that can be edited gives up its hint under a
 * finger, where the line of its place already says where it is.
 */
const HOLD_MS = 500;
const MOVE_PX = 10;
const coarse = ref(false);
let hold: ReturnType<typeof setTimeout> | undefined;
let origin: { x: number; y: number } | undefined;
/** A long press just opened the editor: the click it ends with is not a choice. */
let held = false;
function onPointerDown(event: PointerEvent) {
  if (!props.editable || props.busy || event.pointerType !== 'touch') return;
  held = false;
  origin = { x: event.clientX, y: event.clientY };
  clearTimeout(hold);
  hold = setTimeout(() => {
    held = true;
    hold = undefined;
    emit('edit');
  }, HOLD_MS);
}
function onPointerMove(event: PointerEvent) {
  if (!hold || !origin) return;
  if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_PX)
    cancelHold();
}
function cancelHold() {
  clearTimeout(hold);
  hold = undefined;
}
function onClick() {
  if (held) {
    held = false;
    return;
  }
  emit('choose');
}
onMounted(() => {
  coarse.value = matchMedia('(pointer: coarse)').matches;
});
onBeforeUnmount(cancelHold);

/**
 * A file waiting to be swept is a warning in the storage, where it is about
 * to go; in a picker, taking it is what keeps it, so it is drawn as any
 * other and its hint alone says so. A file only a draft or a version of a
 * text still shows is drawn the same: it goes with them, most likely.
 */
const sweeping = computed(
  () =>
    Boolean(props.item.deleteAfter || props.item.inHistory) &&
    props.selected === undefined,
);

const warning = computed(() =>
  props.item.selectionError === 'size'
    ? phrase.value.asset_selection_size
    : props.item.selectionError === 'type'
      ? phrase.value.asset_selection_type
      : undefined,
);
</script>

<template>
  <div class="group/tile relative">
    <button
      data-feed-tile
      :data-asset-uuid="item.asset.assetUuid"
      type="button"
      :disabled="busy"
      :aria-label="assetFileLabel(item.asset)"
      :aria-pressed="selected"
      :data-title-popup="editable && coarse ? undefined : title"
      class="block w-full cursor-pointer rounded-normal select-none
        [-webkit-touch-callout:none]"
      @focus="engaged = true"
      @blur="engaged = false"
      @keydown="emit('key', $event)"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="cancelHold"
      @pointercancel="cancelHold"
      @pointerleave="cancelHold"
      @contextmenu="editable && coarse && $event.preventDefault()"
      @click="onClick"
    >
      <AssetTile
        :media="item.asset.media"
        :extension="item.asset.extension || '?'"
        :engaged
        :tone="sweeping ? 'danger' : 'default'"
        loop
        :selected
        :overlay="{
          showVideo: true,
          showExtension: true,
          showSize: true,
          size: item.asset.size,
          pendingDeletion: sweeping,
          inHistory: item.inHistory,
          heldByAi: item.heldByAi,
          warning,
        }"
        class="aspect-square w-full"
      />
    </button>
    <button
      v-if="editable"
      type="button"
      :disabled="busy"
      :aria-label="phrase.upload_apply_settings"
      :data-title-popup="phrase.upload_apply_settings"
      data-feed-tile-edit
      class="pointer-events-none absolute top-1.5 left-1/2 z-10 flex size-8
        -translate-x-1/2 cursor-pointer items-center justify-center rounded-full
        bg-bg-1/85 text-text-1 opacity-0 shadow-md shadow-shadow-2
        backdrop-blur-sm transition duration-250
        group-hover/tile:pointer-events-auto group-hover/tile:opacity-100
        focus-visible:pointer-events-auto focus-visible:opacity-100
        motion-reduce:transition-none hocus:bg-accent hocus:text-white"
      @click="emit('edit')"
    >
      <Icon name="edit" />
    </button>
  </div>
</template>
