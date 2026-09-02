<script lang="ts" setup>
import type { ContentGalleryItem } from '#layers/thei/shared/content';
import {
  moveItemById,
  useDragSort,
} from '#layers/thei/app/composables/drag-sort';
import { gallerySelectedId } from './gallery-state';

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
        :aria-label="chooseLabel"
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

    <ContentMediaCard
      v-if="activeItem?.asset.media"
      :key="activeItem.id"
      :asset="activeItem.asset"
      layout="centered"
      :caption="activeItem.caption"
      :editable
      :edit-label="chooseLabel"
      :caption-placeholder
      :media-rounded="false"
      :media-natural-size="false"
      :openable
      caption-class="px-xs pb-xs"
      class="border-t border-border-1"
      @edit="emit('edit', activeItem.id)"
      @caption="emit('caption', activeItem.id, $event)"
      @open="emit('open', activeItem)"
    />
  </section>
</template>
