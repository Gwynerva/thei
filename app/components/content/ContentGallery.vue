<script lang="ts" setup>
import type { ContentGalleryItem } from '#layers/thei/shared/content';
import {
  moveItemById,
  useDragSort,
} from '#layers/thei/app/composables/drag-sort';
import { gallerySelectedId } from './gallery-state';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';

const props = withDefaults(
  defineProps<{
    items: ContentGalleryItem[];
    editable?: boolean;
    selectedId?: string;
    chooseLabel?: string;
    addLabel?: string;
    removeLabel?: string;
    captionPlaceholder?: string;
    openable?: boolean;
  }>(),
  { editable: false },
);

/**
 * What a tile is called: while editing, the action it opens; on the page,
 * the action of showing the picture, named by its caption when it has one —
 * distinct from the picture's own button, which opens the viewer.
 */
function tileLabel(item: ContentGalleryItem) {
  const caption =
    !props.editable && item.caption && richTextToPlainText(item.caption);
  return caption ? `${props.chooseLabel}: ${caption}` : props.chooseLabel;
}

const emit = defineEmits<{
  'update:selectedId': [id: string | undefined];
  add: [];
  edit: [id: string];
  remove: [id: string];
  reorder: [items: ContentGalleryItem[]];
  caption: [id: string, value: string];
  open: [item: ContentGalleryItem];
}>();

const tileRoot = useTemplateRef<HTMLElement>('tileRoot');
const internalSelectedId = ref<string | undefined>(props.selectedId);
const activeId = computed(() =>
  gallerySelectedId(props.items, internalSelectedId.value ?? props.selectedId),
);
const activeItem = computed(
  () =>
    props.items.find((item) => item.id === activeId.value) ?? props.items[0],
);
const crossfade = useGalleryCrossfade(activeItem, (item) => item.id);
const galleryLayers = computed(() =>
  crossfade.layers.value.filter((layer) => layer.item.asset.media),
);
watch(
  () => crossfade.incoming.value,
  async (item) => {
    if (!item) return;
    const incomingMedia = item.asset.media;
    const displayedMedia = crossfade.displayed.value?.asset.media;
    if (
      incomingMedia &&
      (!displayedMedia ||
        incomingMedia.kind !== displayedMedia.kind ||
        incomingMedia.src !== displayedMedia.src ||
        incomingMedia.previewSrc !== displayedMedia.previewSrc)
    ) {
      return;
    }
    await nextTick();
    crossfade.settleIncoming(item.id);
  },
);

function select(id: string) {
  if (id === activeId.value) return;
  internalSelectedId.value = id;
  emit('update:selectedId', id);
}

watch(
  () => props.selectedId,
  (id) => {
    if (id !== undefined) internalSelectedId.value = id;
  },
);

watch(
  () => props.items.map((item) => item.id),
  (ids) => {
    const selected = gallerySelectedId(props.items, activeId.value);
    if (selected === activeId.value) return;
    internalSelectedId.value = selected;
    emit('update:selectedId', selected);
  },
  { immediate: true },
);

const dragSort = useDragSort(
  () => (props.editable ? tileRoot.value : undefined),
  {
    onDrop: ({ id, newIndex }) => {
      if (!props.editable) return;
      const next = moveItemById(props.items, id, newIndex, (item) => item.id);
      if (next.every((item, index) => item.id === props.items[index]?.id))
        return;
      emit('reorder', next);
    },
  },
);
</script>

<template>
  <section
    v-if="editable || items.length"
    class="min-w-0 overflow-hidden rounded-normal bg-bg-3"
    data-content-gallery
  >
    <div ref="tileRoot" class="flex flex-wrap items-start gap-xs p-xs sm:p-sm">
      <AssetTile
        v-for="item in items"
        :key="item.id"
        :data-drag-id="editable ? item.id : undefined"
        :media="item.asset.media"
        :selected="item.id === activeItem?.id"
        :overlay="{
          showVideo: !editable,
          showSize: editable,
          size: item.asset.size,
        }"
        :aria-label="tileLabel(item)"
        :aria-pressed="item.id === activeItem?.id"
        class="size-18 shrink-0 cursor-pointer"
        :class="editable ? 'cursor-grab active:cursor-grabbing' : ''"
        @click="dragSort.guardClick(() => select(item.id))"
      >
        <template v-if="editable" #overlay>
          <div
            v-if="item.asset.media?.kind === 'video'"
            class="pointer-events-none absolute top-1 left-1 z-50 rounded-full
              bg-black/30 p-1 text-xs leading-none text-white backdrop-blur-sm"
          >
            <Icon name="play-circle" />
          </div>
          <button
            type="button"
            data-drag-ignore
            class="absolute top-1 right-1 z-50 flex size-6 cursor-pointer
              items-center justify-center rounded-full bg-bg-1/85 text-xs
              text-text-2 shadow backdrop-blur-sm transition hocus:bg-bg-error
              hocus:text-text-error"
            :aria-label="removeLabel"
            @click.stop="emit('remove', item.id)"
          >
            <Icon name="delete" />
          </button>
        </template>
      </AssetTile>

      <AssetTile
        v-if="editable"
        data-drag-ignore
        :aria-label="addLabel"
        class="size-18 shrink-0 cursor-pointer"
        @click="emit('add')"
      />
    </div>

    <div
      v-if="crossfade.displayed.value?.asset.media"
      class="grid border-t border-border-1"
      data-gallery-crossfade
    >
      <ContentMediaCard
        v-for="layer in galleryLayers"
        :key="layer.item.id"
        :asset="layer.item.asset"
        layout="centered"
        :caption="layer.item.caption"
        :editable
        :edit-label="chooseLabel"
        :caption-placeholder
        :media-rounded="false"
        :media-natural-size="false"
        :openable
        :suspended="
          layer.role === 'displayed'
            ? Boolean(crossfade.incoming.value)
            : !crossfade.revealing.value
        "
        :inert="
          layer.role === 'displayed'
            ? Boolean(crossfade.incoming.value)
            : !crossfade.revealing.value
        "
        caption-class="px-xs pb-xs"
        class="col-start-1 row-start-1 transition-opacity duration-300
          motion-reduce:duration-0"
        :class="{
          'pointer-events-none opacity-0':
            layer.role === 'displayed'
              ? crossfade.revealing.value
              : !crossfade.revealing.value,
          'pointer-events-auto opacity-100':
            layer.role === 'incoming' && crossfade.revealing.value,
        }"
        :data-gallery-outgoing="layer.role === 'displayed' ? '' : undefined"
        :data-gallery-incoming="layer.role === 'incoming' ? '' : undefined"
        @ready="
          layer.role === 'incoming' && crossfade.settleIncoming(layer.item.id)
        "
        @error="
          layer.role === 'incoming' && crossfade.settleIncoming(layer.item.id)
        "
        @edit="emit('edit', layer.item.id)"
        @caption="emit('caption', layer.item.id, $event)"
        @open="emit('open', layer.item)"
      />
    </div>
  </section>
</template>
