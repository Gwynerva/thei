<script lang="ts" setup>
/**
 * Reusable modal pane for viewing and editing an existing asset.
 *
 * - Preview: video (controls) when videoUrl present, otherwise <img>
 * - Optional caption + access fields (showCaption / showAccess)
 * - Buttons: primary (Save/Add), Replace, View+size, Delete
 *
 * Replace modes
 *   imageProfileId provided → pushes AssetPickPane for image (+ video if videoProfileId set)
 *   onReplaceClick provided → caller handles the replace flow (e.g. ShowcaseAddPane quality picker)
 *
 * After replace, internal state updates and onReplaced is fired.
 * After delete, onDeleted is fired and the modal is closed.
 */
import type {
  AssetReplaceResult,
  AssetUploadResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import AssetPickPane from './AssetPickPane.vue';
import { mapUploadResponseToPickResult } from './AssetPickPane.vue';

const props = defineProps<{
  previewUrl?: string;
  videoUrl?: string;
  size?: number;
  assetUuid?: string;
  extension?: string;
  assetUrl?: string;

  /** If provided, enables Replace via AssetPickPane (image + optional video). */
  imageProfileId?: AssetProfileId;
  /** Optional original-variant image profile (uncompressed/as-is). */
  imageOriginalProfileId?: AssetProfileId;
  /** Passed through to AssetPickPane for video support. */
  videoProfileId?: AssetProfileId;
  /** Optional original-variant video profile (uncompressed/as-is). */
  videoOriginalProfileId?: AssetProfileId;

  /** Optional caption field. */
  showCaption?: boolean;
  initialCaption?: string;
  /** Override caption field label (default: phrase.showcase_caption). */
  captionLabel?: string;
  /** Render caption as a <FieldTextarea> instead of <FieldInput>. */
  captionAsTextarea?: boolean;

  /** Optional title field (shown above caption when enabled). */
  showTitle?: boolean;
  initialTitle?: string;
  /** When true, the title field is required and cannot be saved empty. */
  requireTitle?: boolean;

  /** Optional access toggle. */
  showAccess?: boolean;
  initialAccess?: 'project' | 'private';

  /** Show Delete button (default true). */
  showDelete?: boolean;

  /**
   * Label for the primary action button (Save / Add).
   * If absent, no primary button is rendered (e.g. icon/banner with auto-save).
   */
  primaryLabel?: string;

  onSave?: (patch: {
    title?: string;
    caption?: string;
    access?: 'project' | 'private';
  }) => void;
  onReplaced?: (result: AssetReplaceResult) => void;
  onDeleted?: () => void;

  /**
   * Custom replace trigger.  When set, Replace button calls this with an
   * `updatePreview` callback that the caller invokes with the new AssetReplaceResult
   * when the custom flow completes.  Used by showcase (quality picker) and other-files.
   */
  onReplaceClick?: (
    updatePreview: (result: AssetReplaceResult) => void,
  ) => void;
}>();

const showDeleteActual = computed(() => props.showDelete ?? true);

const modal = useModal();
const formatSize = useHumanSize();

// Internal reactive state (updated when a replace completes)
const currentPreviewUrl = ref(props.previewUrl);
const currentVideoUrl = ref(props.videoUrl);
const currentSize = ref(props.size);
const currentAssetUuid = ref(props.assetUuid);
const currentExtension = ref(props.extension);
const currentAssetUrl = ref(props.assetUrl);

const caption = ref(props.initialCaption ?? '');
const title = ref(props.initialTitle ?? '');
const access = ref<'project' | 'private'>(props.initialAccess ?? 'project');
const titleSubmitAttempted = ref(false);

const titleError = computed(() => {
  if (!props.requireTitle || !props.showTitle) return undefined;
  if (title.value.trim()) return undefined;
  return {
    message: phrase.value.this_field_must_be_filled,
    hard: titleSubmitAttempted.value,
  };
});

function updatePreview(result: AssetReplaceResult) {
  currentPreviewUrl.value = result.previewUrl;
  currentVideoUrl.value = result.videoUrl;
  currentSize.value = result.size;
  currentAssetUuid.value = result.assetUuid;
  currentExtension.value = result.extension;
  currentAssetUrl.value = result.assetUrl;
  props.onReplaced?.(result);
}

function onReplace() {
  if (props.onReplaceClick) {
    props.onReplaceClick(updatePreview);
    return;
  }
  if (!props.imageProfileId) return;
  modal.push({
    title: phrase.value.asset_replace,
    component: AssetPickPane,
    props: {
      imageProfileId: props.imageProfileId,
      imageOriginalProfileId: props.imageOriginalProfileId,
      videoProfileId: props.videoProfileId,
      videoOriginalProfileId: props.videoOriginalProfileId,
    },
    onBack(result: unknown) {
      if (!result) return;
      updatePreview(
        mapUploadResponseToPickResult(result as AssetUploadResponse),
      );
    },
  });
}

function onPrimary() {
  if (props.requireTitle && props.showTitle && !title.value.trim()) {
    titleSubmitAttempted.value = true;
    return;
  }
  props.onSave?.({
    title: props.showTitle ? title.value.trim() || undefined : undefined,
    caption: props.showCaption ? caption.value.trim() || undefined : undefined,
    access: props.showAccess ? access.value : undefined,
  });
  modal.close();
}

function onDelete() {
  props.onDeleted?.();
  modal.close();
}

function viewRaw() {
  const url =
    currentAssetUrl.value ?? currentVideoUrl.value ?? currentPreviewUrl.value;
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="flex flex-col gap-md">
    <!-- Preview -->
    <video
      v-if="currentVideoUrl"
      controls
      :src="currentVideoUrl"
      :poster="currentPreviewUrl"
      class="max-h-[50vh] w-full rounded-normal bg-black"
    />
    <img
      v-else-if="currentPreviewUrl"
      :src="currentPreviewUrl"
      class="m-auto max-h-[50vh] rounded-normal object-contain"
      alt="Preview"
    />
    <div
      v-else-if="currentExtension"
      class="flex max-h-[50vh] min-h-40 w-full items-center justify-center
        rounded-normal border-2 border-border-1 bg-bg-1"
    >
      <span class="truncate px-md text-center text-4xl font-bold text-text-2">
        {{ currentExtension.toUpperCase() }}
      </span>
    </div>

    <!-- Title -->
    <Field v-if="showTitle">
      <FieldLabel>{{ phrase.other_title }}</FieldLabel>
      <FieldInput v-model="title" :error="titleError" />
    </Field>

    <!-- Caption / Description -->
    <Field v-if="showCaption">
      <FieldLabel>{{ captionLabel ?? phrase.showcase_caption }}</FieldLabel>
      <FieldTextarea
        v-if="captionAsTextarea"
        v-model="caption"
        :placeholder="phrase.showcase_caption_hint"
      />
      <FieldInput
        v-else
        v-model="caption"
        :placeholder="phrase.showcase_caption_hint"
      />
    </Field>

    <!-- Access -->
    <Field v-if="showAccess">
      <FieldOptions
        v-model="access"
        :options="{
          project: { title: phrase.showcase_access_same_as_project },
          private: { title: phrase.showcase_access_private },
        }"
      />
    </Field>

    <!-- Button row -->
    <div class="flex gap-sm">
      <!-- Primary (Save / Add) -->
      <Button
        v-if="primaryLabel"
        variant="primary"
        class="flex-1"
        @click="onPrimary"
      >
        {{ primaryLabel }}
      </Button>

      <!-- Replace -->
      <Button
        v-if="imageProfileId || onReplaceClick"
        variant="secondary"
        :class="primaryLabel ? '' : 'flex-1'"
        @click="onReplace"
      >
        <Icon name="edit" class="mr-xs" />
        {{ phrase.asset_replace }}
      </Button>

      <!-- View + size -->
      <Button variant="secondary" class="flex-col gap-0" @click="viewRaw">
        <Icon name="eye-open" />
        <span v-if="currentSize != null" class="text-xs leading-none">
          {{ formatSize(currentSize) }}
        </span>
      </Button>

      <!-- Delete -->
      <Button v-if="showDeleteActual" variant="delete" @click="onDelete">
        <Icon name="delete" />
      </Button>
    </div>
  </div>
</template>
