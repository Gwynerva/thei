<script lang="ts" setup>
import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import type { ContentAssetData } from '#layers/thei/shared/content';

/**
 * A recording in a text: its title, the player, and a caption under it, as
 * a picture has one. The title and caption are plain text, as a file's are,
 * so the block turns into a file and back without losing a word.
 */
const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    title?: string;
    caption?: string;
    editable?: boolean;
    editLabel?: string;
    titlePlaceholder?: string;
    captionPlaceholder?: string;
  }>(),
  {
    title: '',
    caption: '',
    editable: false,
    editLabel: '',
    titlePlaceholder: '',
    captionPlaceholder: '',
  },
);

const emit = defineEmits<{
  edit: [];
  title: [value: string];
  caption: [value: string];
}>();

const humanSize = useHumanSize();

/**
 * A version of the text restored from another tab carries only the file's
 * id: the player then plays it from the library, and asks the file its
 * length. The editor saves under that id, never this address.
 */
const src = computed(
  () => props.asset.assetUrl ?? buildAssetPreviewUrl(props.asset.assetUuid),
);
const shownTitle = computed(() => publicText(props.title));
</script>

<template>
  <figure class="min-w-0" data-content-audio>
    <div
      class="audio-card flex min-w-0 flex-col gap-xs rounded-normal border
        border-border-1 bg-bg-2 p-xs text-text-1 sm:px-sm"
    >
      <div
        v-if="editable || shownTitle"
        class="flex min-w-0 items-center gap-xs"
      >
        <ContentPlainTextField
          v-if="editable"
          :model-value="title"
          :editable="true"
          :placeholder="titlePlaceholder"
          class="min-h-6 min-w-0 flex-1 truncate font-semibold tracking-tight
            outline-none empty:before:pointer-events-none
            empty:before:text-text-3
            empty:before:content-[attr(data-placeholder)] focus:before:hidden"
          @update:model-value="emit('title', $event)"
        />
        <span
          v-else
          class="min-w-0 flex-1 truncate font-semibold tracking-tight"
          data-audio-title
        >
          {{ shownTitle }}
        </span>
        <template v-if="editable">
          <span
            v-if="asset.size != null"
            data-content-media-size
            class="shrink-0 rounded-full bg-bg-1/80 px-2 py-1 text-xs
              leading-none whitespace-nowrap text-text-2"
            >{{ humanSize(asset.size) }}</span
          >
          <button
            type="button"
            data-drag-ignore
            data-content-audio-edit
            class="flex size-8 shrink-0 cursor-pointer items-center
              justify-center rounded-full text-text-2 transition outline-none
              focus-visible:ring-2 focus-visible:ring-accent hocus:bg-bg-3
              hocus:text-text-1"
            :aria-label="editLabel"
            :data-title-popup="editLabel"
            @click.stop="emit('edit')"
          >
            <Icon name="edit" />
          </button>
        </template>
      </div>
      <!-- Another file is another recording: nothing played carries over. -->
      <AudioPlayer
        :key="src"
        :src
        :extension="asset.extension"
        :duration="asset.audio?.duration"
        :peaks="asset.audio?.peaks"
        :title="shownTitle || undefined"
        :download="!editable"
      />
    </div>
    <ContentPlainTextField
      v-if="editable"
      :model-value="caption"
      :editable="true"
      :placeholder="captionPlaceholder"
      class="mt-xs min-h-6 w-full text-sm text-text-2 outline-none
        empty:before:pointer-events-none empty:before:text-text-3
        empty:before:content-[attr(data-placeholder)] focus:before:hidden"
      @update:model-value="emit('caption', $event)"
    />
    <figcaption v-else-if="caption" class="mt-xs text-sm text-text-2">
      {{ publicText(caption) }}
    </figcaption>
  </figure>
</template>

<style scoped>
/*
 * Mixed with the card's own surface rather than laid over it: the card may
 * lie on a pattern — the locks of a private section — and a translucent
 * tint would let it show through.
 */
.audio-card {
  background-color: color-mix(
    in oklab,
    var(--color-accent) 4%,
    var(--color-bg-2)
  );
}
</style>
