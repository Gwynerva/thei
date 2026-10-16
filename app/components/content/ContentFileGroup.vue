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
 * Files listed together under one title, each shown as it would be alone —
 * a recording played in place, any other file as a card — closer together
 * than blocks are. While edited, each file has a grip to move it by, and the
 * group a button to add more.
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
</script>

<template>
  <section
    v-if="editable || entries.length"
    class="flex min-w-0 flex-col gap-xs"
    data-content-file-group
  >
    <ContentPlainTextField
      v-if="editable"
      :model-value="title"
      :editable="true"
      :placeholder="titlePlaceholder"
      class="min-h-6 truncate font-semibold tracking-tight text-text-1
        outline-none empty:before:pointer-events-none empty:before:text-text-3
        empty:before:content-[attr(data-placeholder)] focus:before:hidden"
      data-file-group-title
      @update:model-value="emit('title', $event)"
    />
    <p
      v-else-if="title"
      class="font-semibold tracking-tight text-text-1"
      data-file-group-title
    >
      {{ publicText(title) }}
    </p>

    <div ref="list" class="flex min-w-0 flex-col gap-xs">
      <div
        v-for="entry in entries"
        :key="entry.id"
        :data-drag-id="editable ? entry.id : undefined"
        class="flex min-w-0 items-start gap-xs"
        data-file-group-entry
      >
        <template v-if="entry.item">
          <Button
            v-if="editable"
            type="button"
            size="icon-sm"
            variant="secondary"
            drag-handle
            class="mt-xs shrink-0 pointer-coarse:size-11"
            data-file-group-handle
            :aria-label="named(moveLabel, entry.item)"
            :data-title-popup="named(moveLabel, entry.item)"
            @keydown.up="nudge($event, entry.id, -1)"
            @keydown.down="nudge($event, entry.id, 1)"
          >
            <Icon name="grip" />
          </Button>
          <ContentAudioCard
            v-if="isRecording(entry.item)"
            :asset="entry.item.asset"
            :title="entry.item.title"
            :caption="entry.item.caption"
            :editable
            :edit-label="editLabel"
            :title-placeholder="fileTitlePlaceholder"
            :caption-placeholder="captionPlaceholder"
            class="min-w-0 flex-1"
            @edit="emit('edit', entry.id)"
            @title="emit('item-title', entry.id, $event)"
            @caption="emit('item-caption', entry.id, $event)"
          />
          <ContentAttachmentCard
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
            variant="delete"
            class="mt-xs shrink-0 pointer-coarse:size-11"
            data-drag-ignore
            :aria-label="named(removeLabel, entry.item)"
            :data-title-popup="named(removeLabel, entry.item)"
            @click="emit('remove', entry.id)"
          >
            <Icon name="delete" />
          </Button>
        </template>
        <!-- A file on its way stands where it will land, under the grips of
             the others, with its name until it has a title of its own. -->
        <template v-else-if="entry.upload">
          <span
            v-if="editable"
            class="size-8 shrink-0 pointer-coarse:size-11"
            aria-hidden="true"
          />
          <div
            class="flex min-w-0 flex-1 items-center gap-sm rounded-normal border
              border-dashed border-border-1 bg-bg-2 p-xs"
          >
            <AssetPendingTile
              :upload="entry.upload"
              class="size-14 shrink-0 sm:size-16"
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

    <Button
      v-if="editable"
      type="button"
      variant="secondary"
      class="flex h-9 shrink-0 items-center gap-xs self-start whitespace-nowrap"
      data-drag-ignore
      data-file-group-add
      @click="emit('add')"
    >
      <Icon name="plus" />
      <span>{{ addLabel }}</span>
    </Button>
  </section>
</template>
