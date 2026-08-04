<script lang="ts" setup>
import type EditorJS from '@editorjs/editorjs';
import type { OutputData } from '@editorjs/editorjs';
import { debounce } from 'perfect-debounce';
import type {
  AssetReplaceResult,
  AssetVariantInfo,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import { AssetType, assetSourceName } from '#layers/thei/shared/asset';
import {
  ContentValidationError,
  collectContentAssetSizeMap,
  collectContentAssetUuids,
  contentDataIsSemanticallyEqual,
  normalizeContentData,
  summarizeContentData,
  type ContentAssetData,
  type ContentFieldModelValue,
  type ContentOutputData,
  type ContentSummary,
} from '#layers/thei/shared/content';
import {
  launchAssetWizard,
  launchAssetBatchWizard,
  launchAssetEditor,
  mapAssetVariantToReplaceResult,
  type AssetWizardOptions,
} from '#layers/thei/app/composables/asset-wizard';
import {
  anyFileExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import ModalWindow from '#layers/thei/app/modals/ModalWindow.vue';
import {
  ContentAttachmentTool,
  ContentGalleryTool,
  ContentMediaTool,
  ExternalLinkTool,
  PrivateAccessTune,
  type ContentEditorAssetKind,
  type ContentEditorEditGalleryItem,
} from '#layers/thei/app/components/content/editor-tools';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { createEditorBlockDrag } from '#layers/thei/app/composables/editor-block-drag';

type ContentEditorResult =
  | {
      type: 'save';
      value: ContentFieldModelValue;
    }
  | {
      type: 'unchanged';
    };

const emit = defineEmits<{
  modalResult: [result: ContentEditorResult];
}>();

const props = defineProps<{
  modalData: {
    title: string;
    value?: ContentFieldModelValue | null;
  };
}>();

const holder = useTemplateRef<HTMLElement>('holder');
const saving = ref(false);
const errorMessage = ref<string | undefined>();
const humanSize = useHumanSize();
const initialData = normalizeContentData(props.modalData.value?.data);
const serializeContent = (data: ContentOutputData) =>
  JSON.stringify(
    normalizeContentData(data).blocks.map(({ id: _id, ...block }) => block),
  );
const {
  value: draftData,
  isDirty,
  markSaved,
} = useSerializableState(initialData, { serialize: serializeContent });
const editorChangePending = ref(false);
const computedInitialSummary = summarizeContentData(
  initialData,
  collectContentAssetSizeMap(initialData),
);
const headerSummary = ref<ContentSummary>({
  blockCount:
    props.modalData.value?.blockCount ?? computedInitialSummary.blockCount,
  assetCount:
    props.modalData.value?.assetCount ?? computedInitialSummary.assetCount,
  assetTotalSize:
    props.modalData.value?.assetTotalSize ??
    computedInitialSummary.assetTotalSize,
});
let editor: EditorJS | undefined;
let cleanupEditorDrag: (() => void) | undefined;
let summaryVersion = 0;

const refreshHeaderSummary = debounce(async () => {
  if (!editor) return;
  const version = ++summaryVersion;
  try {
    const data = normalizeContentData((await editor.save()) as OutputData);
    const next = summarizeContentData(data, collectContentAssetSizeMap(data));
    if (version === summaryVersion) {
      draftData.value = data;
      headerSummary.value = next;
      editorChangePending.value = false;
    }
  } catch {
    // Editor.js can briefly be between block states while a tool is updating.
  }
}, 150);

useModalCloseGuard(
  () =>
    (!editorChangePending.value && !isDirty.value) ||
    window.confirm(phrase.value.unsaved_modal_confirm),
);

function handleEditorChange() {
  editorChangePending.value = true;
  void refreshHeaderSummary();
}

onMounted(async () => {
  document.body.classList.add('content-editor-modal-open');

  const [
    { default: Editor },
    { default: Header },
    { default: List },
    { default: Quote },
  ] = await Promise.all([
    import('@editorjs/editorjs'),
    import('@editorjs/header'),
    import('@editorjs/list'),
    import('@editorjs/quote'),
  ]);

  editor = new Editor({
    holder: holder.value!,
    data: toEditorData(props.modalData.value?.data),
    autofocus: true,
    onChange: handleEditorChange,
    placeholder: phrase.value.content_editor_placeholder,
    i18n: {
      messages: editorJsI18nMessages(),
    },
    minHeight: 240,
    inlineToolbar: ['bold', 'italic', 'link'],
    sanitizer: {
      p: true,
      b: true,
      strong: true,
      i: true,
      em: true,
      a: {
        href: true,
        rel: true,
        target: true,
      },
      br: true,
    },
    tunes: ['privateAccess'],
    tools: {
      header: {
        class: Header,
        inlineToolbar: true,
        config: {
          levels: [2, 3, 4],
          defaultLevel: 2,
        },
      },
      list: {
        class: List,
        inlineToolbar: true,
        config: {
          defaultStyle: 'unordered',
        },
      },
      quote: {
        class: Quote,
        inlineToolbar: true,
      },
      contentMedia: {
        class: ContentMediaTool,
        config: {
          pickAsset,
          editAsset,
          labels: contentToolLabels(),
        },
      },
      contentGallery: {
        class: ContentGalleryTool,
        config: {
          pickAssets,
          editGalleryItem,
          labels: contentToolLabels(),
        },
      },
      contentAttachment: {
        class: ContentAttachmentTool,
        config: {
          pickAsset,
          editAsset,
          labels: contentToolLabels(),
        },
      },
      externalLink: {
        class: ExternalLinkTool,
      },
      privateAccess: {
        class: PrivateAccessTune,
        config: {
          labels: contentToolLabels(),
        },
      },
    },
  });

  await editor.isReady;
  cleanupEditorDrag = createEditorBlockDrag(holder.value!, editor);
});

onBeforeUnmount(() => {
  summaryVersion++;
  cleanupEditorDrag?.();
  cleanupEditorDrag = undefined;
  document.body.classList.remove(
    'content-editor-block-dragging',
    'content-editor-modal-open',
  );
  editor?.destroy();
  editor = undefined;
});

async function save() {
  if (!editor || saving.value) return;
  saving.value = true;
  errorMessage.value = undefined;
  try {
    const raw = (await editor.save()) as OutputData;
    const data = normalizeContentData(raw) as ContentOutputData;
    draftData.value = data;
    if (contentDataIsSemanticallyEqual(data, props.modalData.value?.data)) {
      markSaved(data);
      emit('modalResult', { type: 'unchanged' });
      return;
    }
    const summary = summarizeContentData(
      data,
      collectContentAssetSizeMap(data),
    );
    markSaved(data);
    emit('modalResult', {
      type: 'save',
      value: {
        contentUuid: props.modalData.value?.contentUuid,
        data,
        ...summary,
      },
    });
  } catch (error) {
    errorMessage.value =
      error instanceof ContentValidationError
        ? error.message
        : phrase.value.content_editor_save_error;
  } finally {
    saving.value = false;
  }
}

async function pickAsset(kind: ContentEditorAssetKind) {
  const asset = await launchContentAssetWizard(contentAssetOptions(kind));

  return asset ? mapAsset(asset) : undefined;
}

async function pickAssets(kind: ContentEditorAssetKind) {
  try {
    const result = await launchAssetBatchWizard(contentAssetOptions(kind));
    if (result?.errors.length) {
      errorMessage.value = result.errors
        .map((error) => `${error.fileName}: ${error.message}`)
        .join(' · ');
    }
    return result?.assets.map(mapAsset) ?? [];
  } catch (error) {
    console.error(error);
    errorMessage.value = phrase.value.content_asset_pick_error;
    return [];
  }
}

async function editAsset(
  current: ContentAssetData,
  kind: ContentEditorAssetKind,
) {
  const flowVersion = modalDismissVersion.value;

  while (true) {
    const result = await openModal(
      assetDetailsModal,
      {
        asideTitle: phrase.value.asset,
        asset: contentAssetReplaceResult(current),
      },
      { label: phrase.value.asset },
    );

    if (result.type === 'replace') {
      const edited = await replaceAsset(current, kind);
      if (modalDismissVersion.value !== flowVersion) return undefined;
      if (!edited) continue;
      return edited;
    }

    if (result.type === 'detach') return null;
    return undefined;
  }
}

async function replaceAsset(
  current: ContentAssetData,
  kind: ContentEditorAssetKind,
) {
  try {
    const response = await $fetch<AssetVariantsResponse>(
      '/api/admin/assets/variants',
      {
        method: 'POST',
        body: { assetUuid: current.assetUuid },
      },
    );
    const stored = response.variants.find(
      (variant) => variant.assetUuid === current.assetUuid,
    );
    if (!stored) return undefined;
    const edited = await launchAssetEditor(stored, {
      ...contentAssetOptions(kind),
      backLabel: phrase.value.asset,
      usageDelta: await buildDraftUsageDelta(),
    });
    return edited ? mapAsset(edited) : undefined;
  } catch (error) {
    console.error(error);
    errorMessage.value = phrase.value.content_asset_pick_error;
    return undefined;
  }
}

function contentAssetOptions(kind: ContentEditorAssetKind): AssetWizardOptions {
  return kind === 'media'
    ? {
        accept: [imageExtensionProfile, videoExtensionProfile],
        maxSize: ASSET_UPLOAD_LIMITS.media,
        sizeLimitPolicy: 'media',
      }
    : {
        accept: anyFileExtensionProfile,
        maxSize: ASSET_UPLOAD_LIMITS.file,
        sizeLimitPolicy: 'file',
      };
}

const editGalleryItem: ContentEditorEditGalleryItem = async (item) => {
  let asset = item.asset;
  let caption = item.caption;
  const flowVersion = modalDismissVersion.value;

  while (true) {
    const result = await openModal(
      assetDetailsModal,
      {
        asideTitle: phrase.value.asset,
        asset: contentAssetReplaceResult(asset),
        primaryLabel: phrase.value.save,
        showCaption: true,
        initialCaption: caption,
        captionPlaceholder: phrase.value.content_caption,
      },
      { label: phrase.value.asset },
    );

    if (result.type === 'replace') {
      caption = result.caption;
      const edited = await replaceAsset(asset, 'media');
      if (modalDismissVersion.value !== flowVersion) return undefined;
      if (!edited) continue;
      asset = edited;
      continue;
    }

    if (result.type === 'detach') return null;
    if (result.type === 'confirm') {
      return {
        ...item,
        asset,
        caption: result.caption,
      };
    }
    return undefined;
  }
};

async function buildDraftUsageDelta() {
  if (!editor) return {};
  const draft = normalizeContentData((await editor.save()) as OutputData);
  const saved = normalizeContentData(props.modalData.value?.data);
  const draftCounts = countContentUsageByAsset(draft);
  const savedCounts = countContentUsageByAsset(saved);
  const keys = new Set([...draftCounts.keys(), ...savedCounts.keys()]);
  return Object.fromEntries(
    Array.from(keys, (assetUuid) => [
      assetUuid,
      (draftCounts.get(assetUuid) ?? 0) - (savedCounts.get(assetUuid) ?? 0),
    ]),
  );
}

function countContentUsageByAsset(data: ContentOutputData) {
  return new Map(
    collectContentAssetUuids(data).map((assetUuid) => [assetUuid, 1]),
  );
}

async function launchContentAssetWizard(
  options: Parameters<typeof launchAssetWizard>[0],
) {
  try {
    return await launchAssetWizard(options);
  } catch (error) {
    console.error(error);
    errorMessage.value = phrase.value.content_asset_pick_error;
    return undefined;
  }
}

function mapAsset(asset: AssetVariantInfo) {
  const result = mapAssetVariantToReplaceResult(asset);
  return {
    assetUuid: asset.assetUuid,
    name: assetSourceName(asset.meta),
    type: asset.type,
    extension: asset.extension,
    size: asset.size,
    media: result.media,
    assetUrl: result.assetUrl,
    archivedOriginal:
      asset.type === AssetType.Other &&
      asset.meta &&
      'archivedOriginal' in asset.meta
        ? asset.meta.archivedOriginal
        : undefined,
  };
}

function contentAssetReplaceResult(
  asset: ContentAssetData,
): AssetReplaceResult {
  return {
    assetUuid: asset.assetUuid,
    slug: asset.assetUuid,
    extension: asset.extension ?? '',
    size: asset.size ?? 0,
    media: asset.media,
    assetUrl: asset.assetUrl ?? asset.media?.src ?? '',
  };
}

function toEditorData(data: ContentOutputData | null | undefined): OutputData {
  return normalizeContentData(data) as OutputData;
}

function contentToolLabels() {
  return {
    chooseMedia: phrase.value.content_choose_media,
    addMedia: phrase.value.content_add_media,
    chooseFile: phrase.value.content_choose_file,
    caption: phrase.value.content_caption,
    title: phrase.value.content_title,
    description: phrase.value.content_description,
    privateAccess: phrase.value.asset_private_access,
  };
}

function editorJsI18nMessages() {
  const text = phrase.value.content_editor_i18n;
  return {
    ui: {
      blockTunes: {
        toggler: {
          'Click to tune': text.tune,
          'or drag to move': text.drag_to_move,
        },
      },
      inlineToolbar: {
        converter: { 'Convert to': text.convert_to },
      },
      toolbar: {
        toolbox: { Add: text.add },
      },
      popover: {
        Filter: text.filter,
        'Nothing found': text.nothing_found,
        'Convert to': text.convert_to,
      },
    },
    toolNames: {
      Text: text.text,
      Link: text.link,
      Bold: text.bold,
      Italic: text.italic,
      Heading: text.heading,
      'Unordered List': text.unordered_list,
      'Ordered List': text.ordered_list,
      Checklist: text.checklist,
      Quote: text.quote,
      Media: text.media,
      Gallery: text.gallery,
      File: text.file,
    },
    tools: {
      link: { 'Add a link': text.add_link },
      header: {
        'Heading 2': text.heading_2,
        'Heading 3': text.heading_3,
        'Heading 4': text.heading_4,
      },
      quote: {
        'Enter a quote': text.enter_quote,
        'Enter a caption': text.enter_caption,
        'Align Left': text.align_left,
        'Align Center': text.align_center,
      },
      list: {
        Unordered: text.unordered,
        Ordered: text.ordered,
        Checklist: text.checklist,
        'Start with': text.start_with,
        'Counter type': text.counter_type,
        Numeric: text.numeric,
        'Lower Roman': text.lower_roman,
        'Upper Roman': text.upper_roman,
        'Lower Alpha': text.lower_alpha,
        'Upper Alpha': text.upper_alpha,
      },
    },
    blockTunes: {
      delete: {
        Delete: text.delete,
        'Click to delete': text.click_to_delete,
      },
      moveUp: { 'Move up': text.move_up },
      moveDown: { 'Move down': text.move_down },
    },
  };
}
</script>

<template>
  <ModalWindow
    :title="modalData.title"
    width="56rem"
    max-height="calc(100dvh - var(--spacing-window) - var(--spacing-window))"
  >
    <template #title>
      <div class="truncate">{{ modalData.title }}</div>
      <div
        class="mt-0.5 flex items-center gap-md text-xs font-normal
          tracking-normal text-text-3"
      >
        <span
          class="inline-flex items-center gap-1 whitespace-nowrap"
          :data-title-popup="
            phrase.content_block_count(headerSummary.blockCount)
          "
        >
          <Icon name="blocks" />
          {{ headerSummary.blockCount }}
        </span>
        <span
          class="inline-flex items-center gap-1 whitespace-nowrap"
          :data-title-popup="
            phrase.content_file_count(headerSummary.assetCount)
          "
        >
          <Icon name="file" />
          {{ headerSummary.assetCount }} /
          {{ humanSize(headerSummary.assetTotalSize) }}
        </span>
      </div>
    </template>
    <template #header-actions>
      <div v-if="errorMessage" class="truncate text-sm text-text-error">
        {{ errorMessage }}
      </div>
      <Button
        class="font-semibold"
        :disabled="saving || (!editorChangePending && !isDirty)"
        @click="save"
      >
        <Icon v-if="saving" name="loading" class="mr-xs" />
        <span>{{
          editorChangePending || isDirty ? phrase.save : phrase.saved
        }}</span>
      </Button>
    </template>

    <div ref="holder" class="content-editor w-full px-sm py-md"></div>
  </ModalWindow>
</template>
