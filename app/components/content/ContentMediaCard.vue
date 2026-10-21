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
      <!-- The file's size beside the edit button, as a tile shows it: what a
           re-encode would gain is read off the block itself. -->
      <div
        v-if="editable"
        data-drag-ignore
        class="absolute top-xs right-xs z-20 flex items-center gap-xs"
      >
        <span
          v-if="asset.size != null"
          data-content-media-size
          class="rounded-full bg-bg-1/80 px-2 py-1 text-xs leading-none
            whitespace-nowrap text-text-2 shadow backdrop-blur-sm"
          >{{ humanSize(asset.size) }}</span
        >
        <button
          type="button"
          class="flex size-9 cursor-pointer items-center justify-center
            rounded-full bg-bg-1/80 text-text-2 shadow backdrop-blur-sm
            transition hocus:bg-bg-1 hocus:text-text-1"
          :aria-label="editLabel"
          @click.stop="emit('edit')"
        >
          <Icon name="edit" />
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
