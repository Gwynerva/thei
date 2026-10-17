<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';
import type { ContentFileGroupItem } from '#layers/thei/shared/content';
import {
  moveItemById,
  useDragSort,
} from '#layers/thei/app/composables/drag-sort';
import AssetPendingTile from '#layers/thei/app/components/AssetPendingTile.vue';
import { hideKeyFromEditor } from '#layers/thei/app/composables/editor-keyboard-boundary';
import type { ContentFileGroupEntry } from './file-group-state';

/**
 * Files listed together: one frame headed by their title, a row for each
 * file — a recording played in place, any other file by its square, its
 * title, its facts and its caption — with hairlines between. While edited,
 * each row ends with a grip to move it by and a button to take it out, shown
 * where the pointer is and always under a finger, and the frame ends with a
 * row that adds more.
 */
const props = withDefaults(
  defineProps<{
    title?: string;
    entries: readonly ContentFileGroupEntry[];
    editable?: boolean;
    openable?: boolean;
    titlePlaceholder?: string;
    fileTitlePlaceholder?: string;
    captionPlaceholder?: string;
    editLabel?: string;
    addLabel?: string;
    removeLabel?: string;
    moveLabel?: string;
    /** What a file is called when its title is not given. */
    fallbackTitle?: (extension?: string) => string;
  }>(),
  { title: '', editable: false, openable: false },
);

const emit = defineEmits<{
  title: [value: string];
  'item-title': [id: string, value: string];
  'item-caption': [id: string, value: string];
  edit: [id: string];
  remove: [id: string];
  reorder: [ids: string[]];
  add: [];
  open: [item: ContentFileGroupItem];
  'cancel-pending': [id: string];
  'retry-pending': [id: string];
}>();

const list = useTemplateRef<HTMLElement>('list');

/**
 * Only a file's grip moves it, so its title, caption and buttons stay what
 * they are under the pointer. A file on its way has no grip, but holds its
 * place in the order.
 */
useDragSort(() => (props.editable ? list.value : undefined), {
  handle: '[data-file-group-handle]',
  onDrop: ({ id, newIndex }) => move(id, newIndex),
});

function move(id: string, index: number) {
  const ids = props.entries.map((entry) => entry.id);
  const next = moveItemById(ids, id, index, (value) => value);
  if (next.every((value, at) => value === ids[at])) return;
  emit('reorder', next);
}

/**
 * The arrows on a grip move its file, and never the caret elsewhere: the key
 * is kept from Editor.js. The grip keeps the focus as its line moves, which
 * a moved element would otherwise lose.
 */
let refocus: string | undefined;
function nudge(event: KeyboardEvent, id: string, by: number) {
  event.preventDefault();
  event.stopPropagation();
  hideKeyFromEditor(event);
  const index = props.entries.findIndex((entry) => entry.id === id);
  refocus = id;
  move(id, Math.max(0, Math.min(props.entries.length - 1, index + by)));
}
watch(
  () => props.entries.map((entry) => entry.id).join(),
  async () => {
    const id = refocus;
    refocus = undefined;
    if (!id) return;
    await nextTick();
    list.value
      ?.querySelector<HTMLElement>(
        `[data-drag-id="${CSS.escape(id)}"] [data-file-group-handle]`,
      )
      ?.focus();
  },
);

function isRecording(item: ContentFileGroupItem) {
  return item.asset.type === AssetType.Audio;
}

/** The words a file's own buttons name it by. */
function named(label: string | undefined, item: ContentFileGroupItem) {
  const name =
    publicText(item.title) || props.fallbackTitle?.(item.asset.extension);
  return name ? `${label}: ${name}` : label;
}

/**
 * A row's own buttons: where the pointer or the focus is, and always under a
 * finger, which has nothing to point with. They stand level with the file's
 * square, or with a recording's title, whatever the caption under them.
 */
const ROW_BUTTON = `shrink-0 opacity-0 transition-opacity
  group-hocus/file:opacity-100 group-focus-within/file:opacity-100
  pointer-coarse:size-11 pointer-coarse:opacity-100`;

function rowButtonClass(item: ContentFileGroupItem) {
  return [
    ROW_BUTTON,
    isRecording(item)
      ? 'mt-xs'
      : `mt-[calc(var(--spacing-xs)+0.5rem)]
        pointer-coarse:mt-[calc(var(--spacing-xs)+0.125rem)]`,
  ];
}
</script>

<template>
  <section
    v-if="editable || entries.length"
    class="flex min-w-0 flex-col divide-y divide-border-1 overflow-clip
      rounded-normal border border-border-1 bg-bg-2"
    data-content-file-group
  >
    <!-- The title heads the frame, a step up from its rows. -->
    <ContentFilesHead
      :title
      :editable
      :placeholder="titlePlaceholder"
      block="file-group"
      @title="emit('title', $event)"
    />

    <div
      ref="list"
      class="flex min-w-0 flex-col divide-y divide-border-1 empty:hidden"
    >
      <div
        v-for="entry in entries"
        :key="entry.id"
        :data-drag-id="editable ? entry.id : undefined"
        class="group/file flex min-w-0 items-start gap-1"
        :class="{ 'pr-xs': editable }"
        data-file-group-entry
      >
        <template v-if="entry.item">
          <ContentAudioCard
            v-if="isRecording(entry.item)"
            :asset="entry.item.asset"
            :title="entry.item.title"
            :caption="entry.item.caption"
            :editable
            :edit-label="editLabel"
            :title-placeholder="fileTitlePlaceholder"
            :caption-placeholder="captionPlaceholder"
            listed
            class="min-w-0 flex-1"
            @edit="emit('edit', entry.id)"
            @title="emit('item-title', entry.id, $event)"
            @caption="emit('item-caption', entry.id, $event)"
          />
          <ContentFileRow
            v-else
            :asset="entry.item.asset"
            :title="entry.item.title"
            :caption="entry.item.caption"
            :editable
            :href="entry.item.asset.assetUrl"
            :openable
            :fallback-title="fallbackTitle?.(entry.item.asset.extension)"
            :edit-label="editLabel"
            :title-placeholder="fileTitlePlaceholder"
            :caption-placeholder="captionPlaceholder"
            class="min-w-0 flex-1"
            @edit="emit('edit', entry.id)"
            @title="emit('item-title', entry.id, $event)"
            @caption="emit('item-caption', entry.id, $event)"
            @open="emit('open', entry.item)"
          />
          <Button
            v-if="editable"
            type="button"
            size="icon-sm"
            variant="secondary"
            drag-handle
            :class="rowButtonClass(entry.item)"
            data-file-group-handle
            :aria-label="named(moveLabel, entry.item)"
            :data-title-popup="named(moveLabel, entry.item)"
            @keydown.up="nudge($event, entry.id, -1)"
            @keydown.down="nudge($event, entry.id, 1)"
          >
            <Icon name="grip" />
          </Button>
          <Button
            v-if="editable"
            type="button"
            size="icon-sm"
            variant="delete"
            :class="rowButtonClass(entry.item)"
            data-drag-ignore
            :aria-label="named(removeLabel, entry.item)"
            :data-title-popup="named(removeLabel, entry.item)"
            @click="emit('remove', entry.id)"
          >
            <Icon name="delete" />
          </Button>
        </template>
        <!-- A file on its way stands where it will land, with its name until
             it has a title of its own. -->
        <template v-else-if="entry.upload">
          <div class="flex min-w-0 flex-1 items-center gap-sm p-xs">
            <AssetPendingTile
              :upload="entry.upload"
              class="size-12 shrink-0"
              @cancel="emit('cancel-pending', entry.id)"
              @retry="emit('retry-pending', entry.id)"
            />
            <span class="min-w-0 flex-1 truncate text-sm text-text-2">{{
              entry.upload.name
            }}</span>
          </div>
        </template>
      </div>
    </div>

    <button
      v-if="editable"
      type="button"
      class="flex min-h-10 w-full cursor-pointer items-center gap-sm px-xs
        text-left text-sm font-semibold text-text-2 transition-colors
        outline-none focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:ring-inset pointer-coarse:min-h-11 hocus:text-accent"
      data-drag-ignore
      data-file-group-add
      @click="emit('add')"
    >
      <!-- The plus under the files' squares, the words under their titles. -->
      <span
        class="flex w-12 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Icon name="plus" />
      </span>
      <span>{{ addLabel }}</span>
    </button>
  </section>
</template>
