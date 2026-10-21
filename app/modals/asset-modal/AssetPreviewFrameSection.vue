<script lang="ts" setup>
import type {
  AssetPreviewFrameRequest,
  AssetPreviewFrameResponse,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import { formatMediaMoment } from '#layers/thei/shared/audio';
import { errorMessage } from '#layers/thei/app/composables/upload-draft';
import AssetPanelSection from './AssetPanelSection.vue';

/**
 * A video's still: the frame it is shown by until it plays, as wide as the
 * panel, and under it the two ways to take one — chosen automatically, or
 * the frame the player stands at. The way the still was taken is the button
 * pressed. The choice is the file's, for every video of its family; the
 * window takes the answer, and every other place that draws the video takes
 * the new still.
 */
const props = defineProps<{
  assetUuid: string;
  /** The still, as the window shows it. */
  poster?: string;
  /** Seconds into the video the still was taken at. */
  previewAt?: number;
  /** The owner chose the still by hand. */
  chosen?: boolean;
  /** Where the player stands; absent until it can tell. */
  currentTime?: number;
  /** Whether the still was chosen is not known yet. */
  pending?: boolean;
}>();

const emit = defineEmits<{
  /** Every video of the family, as it shows now; the one asked about first. */
  chosen: [variants: AssetVariantInfo[]];
  /** The owner asked the player to stand at the still's moment. */
  seek: [seconds: number];
}>();

const busy = ref<'take' | 'auto'>();
const failure = ref('');

const automatic = computed(() => !props.pending && !props.chosen);
const byHand = computed(() => !props.pending && Boolean(props.chosen));

/** Taking the frame the still already is would change nothing. */
const sameFrame = computed(
  () =>
    byHand.value &&
    props.previewAt !== undefined &&
    props.currentTime !== undefined &&
    Math.round(props.currentTime * 1000) === Math.round(props.previewAt * 1000),
);

async function choose(at: number | null) {
  if (busy.value) return;
  busy.value = at === null ? 'auto' : 'take';
  failure.value = '';
  try {
    const { variants, failed } = await $fetch<AssetPreviewFrameResponse>(
      `/api/admin/assets/${props.assetUuid}/preview`,
      { method: 'POST', body: { at } satisfies AssetPreviewFrameRequest },
    );
    for (const variant of variants) rememberVideoStill(variant.media);
    emit('chosen', variants);
    if (failed.length)
      failure.value = phrase.value.asset_preview_frame_partial(failed.length);
  } catch (error) {
    failure.value = errorMessage(error, phrase.value.asset_preview_frame_error);
  } finally {
    busy.value = undefined;
  }
}

/** A way pressed stays as clear while there is nothing more it can do. */
function wayClasses(pressed: boolean) {
  return pressed
    ? 'border-accent bg-bg-accent text-accent off:cursor-default'
    : `border-border-1 bg-bg-1 text-text-2 off:cursor-not-allowed
      off:text-text-3/80 hocus:not-off:border-border-3
      hocus:not-off:text-text-1`;
}
</script>

<template>
  <AssetPanelSection
    :title="phrase.asset_preview_frame"
    data-asset-preview-frame
    :data-asset-preview-frame-state="
      pending ? undefined : chosen ? 'chosen' : 'auto'
    "
  >
    <button
      type="button"
      class="flex aspect-video w-full cursor-pointer items-center justify-center
        overflow-hidden rounded-normal border border-border-1 bg-bg-3 text-2xl
        text-text-3 transition-colors disabled:cursor-default
        hocus:not-disabled:border-border-3"
      :disabled="previewAt === undefined || currentTime === undefined"
      :aria-label="phrase.asset_preview_frame_seek"
      :data-title-popup="phrase.asset_preview_frame_seek"
      data-asset-preview-frame-poster
      @click="previewAt !== undefined && emit('seek', previewAt)"
    >
      <img
        v-if="poster"
        :src="sitePath(poster)"
        alt=""
        draggable="false"
        class="size-full object-contain"
      />
      <Icon v-else name="media" />
    </button>
    <div
      role="group"
      :aria-label="phrase.asset_preview_frame"
      class="flex flex-col gap-1 rounded-normal bg-bg-3 p-1 text-sm"
    >
      <button
        type="button"
        class="flex h-9 w-full min-w-0 cursor-pointer items-center
          justify-center gap-xs rounded-normal border-2 px-sm transition"
        :class="wayClasses(automatic)"
        :aria-pressed="automatic"
        :disabled="pending || automatic || Boolean(busy)"
        data-asset-preview-frame-auto
        @click="choose(null)"
      >
        <Icon
          :name="busy === 'auto' ? 'loading' : automatic ? 'check' : 'refresh'"
          class="shrink-0"
        />
        <span class="truncate font-semibold">{{
          phrase.asset_preview_frame_auto
        }}</span>
      </button>
      <button
        type="button"
        class="flex h-9 w-full min-w-0 cursor-pointer items-center
          justify-center gap-xs rounded-normal border-2 px-sm transition"
        :class="wayClasses(byHand)"
        :aria-pressed="byHand"
        :disabled="
          pending || Boolean(busy) || currentTime === undefined || sameFrame
        "
        :data-title-popup="phrase.asset_preview_frame_take_hint"
        data-asset-preview-frame-take
        @click="currentTime !== undefined && choose(currentTime)"
      >
        <Icon
          :name="busy === 'take' ? 'loading' : byHand ? 'check' : 'media'"
          class="shrink-0"
        />
        <span class="truncate font-semibold tabular-nums">{{
          phrase.asset_preview_frame_take(formatMediaMoment(currentTime ?? 0))
        }}</span>
      </button>
    </div>
    <p
      v-if="failure"
      role="alert"
      class="text-xs text-text-error"
      data-asset-preview-frame-error
    >
      {{ failure }}
    </p>
  </AssetPanelSection>
</template>
