<script lang="ts" setup>
import type {
  AssetPreviewFrameRequest,
  AssetPreviewFrameResponse,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import { formatMediaMoment, formatMediaTime } from '#layers/thei/shared/audio';
import { errorMessage } from '#layers/thei/app/composables/upload-draft';
import AssetPanelSection from './AssetPanelSection.vue';

/**
 * A video's still, in its file window: the frame it is shown by until it
 * plays, whether the owner chose it, and the way to choose another — the
 * frame the player stands at — or to let it be picked by itself again. The
 * choice is the file's, for every video of its family; the window takes the
 * answer, and every other place that draws the video takes the new still.
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

/** Taking the frame the still already is would change nothing. */
const sameFrame = computed(
  () =>
    props.chosen &&
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
</script>

<template>
  <AssetPanelSection
    :title="phrase.asset_preview_frame"
    data-asset-preview-frame
  >
    <div class="flex items-center gap-sm">
      <button
        type="button"
        class="flex aspect-video w-24 shrink-0 cursor-pointer items-center
          justify-center overflow-hidden rounded-normal border border-border-1
          bg-bg-3 text-xl text-text-3 transition-colors disabled:cursor-default
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
      <div class="flex min-w-0 flex-col items-start gap-xs">
        <span
          v-if="pending"
          class="h-lh w-28 animate-pulse rounded-normal bg-bg-3
            motion-reduce:animate-none"
          aria-hidden="true"
        ></span>
        <span
          v-else
          class="text-text-2 tabular-nums"
          :data-asset-preview-frame-state="chosen ? 'chosen' : 'auto'"
          >{{
            chosen
              ? phrase.asset_preview_frame_chosen(
                  formatMediaTime(previewAt ?? 0),
                )
              : phrase.asset_preview_frame_auto
          }}</span
        >
        <TransitionFade>
          <Button
            v-if="chosen && !pending"
            variant="secondary"
            class="flex items-center gap-xs"
            :disabled="Boolean(busy)"
            data-asset-preview-frame-auto
            @click="choose(null)"
          >
            <Icon v-if="busy === 'auto'" name="loading" class="shrink-0" />
            <span class="truncate">{{
              phrase.asset_preview_frame_auto_take
            }}</span>
          </Button>
        </TransitionFade>
      </div>
    </div>
    <Button
      variant="secondary"
      class="flex h-9 w-full min-w-0 items-center justify-center gap-xs"
      :disabled="Boolean(busy) || currentTime === undefined || sameFrame"
      :data-title-popup="phrase.asset_preview_frame_take_hint"
      data-asset-preview-frame-take
      @click="currentTime !== undefined && choose(currentTime)"
    >
      <Icon :name="busy === 'take' ? 'loading' : 'media'" class="shrink-0" />
      <span class="truncate tabular-nums">{{
        phrase.asset_preview_frame_take(formatMediaMoment(currentTime ?? 0))
      }}</span>
    </Button>
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
