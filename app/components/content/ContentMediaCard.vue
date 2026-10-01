<script lang="ts" setup>
import type {
  ContentAssetData,
  ContentMediaLayout,
} from '#layers/thei/shared/content';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';

withDefaults(
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
  }>(),
  { mediaRounded: true, mediaNaturalSize: true },
);

const emit = defineEmits<{
  edit: [];
  caption: [value: string];
  open: [];
}>();

const humanSize = useHumanSize();
</script>

<template>
  <figure class="min-w-0">
    <!-- Another picture is another frame: nothing measured for the last one
         carries over. -->
    <ContentMedia
      :key="asset.media?.src"
      :asset
      :layout
      :rounded="mediaRounded"
      :natural-size="mediaNaturalSize"
    >
      <button
        v-if="openable && !editable && asset.media?.kind === 'image'"
        type="button"
        class="absolute inset-0 z-10 cursor-zoom-in focus-visible:ring-2
          focus-visible:ring-accent focus-visible:ring-inset"
        :aria-label="richTextToPlainText(caption ?? '') || phrase.asset"
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
    </ContentMedia>
    <ContentCaption
      :model-value="caption"
      :editable
      :placeholder="captionPlaceholder"
      :centered="centeredCaption"
      :class="captionClass"
      @update:model-value="emit('caption', $event)"
    />
  </figure>
</template>
