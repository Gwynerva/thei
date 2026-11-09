<script lang="ts" setup>
import type {
  ContentAssetData,
  ContentMediaLayout,
} from '#layers/thei/shared/content';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';

const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    layout: ContentMediaLayout;
    caption?: string;
    editable?: boolean;
    editLabel?: string;
    /** Named, a round «+» before the edit button picks more pictures. */
    addLabel?: string;
    captionPlaceholder?: string;
    centeredCaption?: boolean;
    mediaRounded?: boolean;
    mediaNaturalSize?: boolean;
    captionClass?: string;
    openable?: boolean;
    /**
     * Inside a frame of its own already — a gallery's — the picture and its
     * caption take none more.
     */
    bare?: boolean;
  }>(),
  { mediaRounded: true, mediaNaturalSize: true, bare: false },
);

const emit = defineEmits<{
  edit: [];
  add: [];
  caption: [value: string];
  open: [];
}>();

const humanSize = useHumanSize();

/**
 * A picture with a caption under it shares one frame with it, the caption on
 * the ground of a surface, as in a gallery: so does one being edited, whose
 * caption is there to be written.
 */
const framed = computed(
  () => !props.bare && (props.editable || !!props.caption),
);
</script>

<template>
  <figure class="min-w-0">
    <ContentMedia
      :asset
      :layout
      :rounded="mediaRounded"
      :natural-size="mediaNaturalSize"
      :framed
    >
      <button
        v-if="openable && !editable && asset.media?.kind === 'image'"
        type="button"
        class="absolute inset-0 z-10 cursor-zoom-in focus-visible:ring-2
          focus-visible:ring-accent focus-visible:ring-inset"
        :aria-label="
          richTextToPlainText(caption ?? '') ||
          publicText(asset.alt) ||
          phrase.asset
        "
        data-opens-viewer
        @click="$emit('open')"
      ></button>
      <!-- More pictures beside this one, then the edit button with the file's
           size in it, as a tile shows it: what a re-encode would gain is read
           off the block itself. -->
      <div
        v-if="editable"
        data-drag-ignore
        class="absolute top-xs right-xs z-20 flex items-center gap-xs"
      >
        <button
          v-if="addLabel"
          type="button"
          data-content-media-add
          class="flex size-9 cursor-pointer items-center justify-center
            rounded-full bg-bg-1/80 text-text-2 shadow backdrop-blur-sm
            transition outline-none focus-visible:ring-2
            focus-visible:ring-accent hocus:bg-bg-1 hocus:text-text-1"
          :aria-label="addLabel"
          :data-title-popup="addLabel"
          @click.stop="emit('add')"
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          data-content-media-edit
          class="flex h-9 min-w-9 cursor-pointer items-center justify-center
            gap-xs rounded-normal bg-bg-1/80 text-text-2 shadow backdrop-blur-sm
            transition outline-none focus-visible:ring-2
            focus-visible:ring-accent hocus:bg-bg-1 hocus:text-text-1"
          :class="asset.size != null ? 'pr-sm pl-2.5' : ''"
          :aria-label="editLabel"
          :data-title-popup="editLabel"
          @click.stop="emit('edit')"
        >
          <Icon name="edit" class="shrink-0" />
          <span
            v-if="asset.size != null"
            data-content-media-size
            class="text-sm leading-none font-semibold whitespace-nowrap
              tabular-nums"
            >{{ humanSize(asset.size) }}</span
          >
        </button>
      </div>
      <template #below>
        <ContentCaption
          :model-value="caption"
          :editable
          :placeholder="captionPlaceholder"
          :centered="centeredCaption"
          :class="captionClass ?? (framed ? 'px-xs pb-xs' : undefined)"
          @update:model-value="emit('caption', $event)"
        />
      </template>
    </ContentMedia>
  </figure>
</template>
