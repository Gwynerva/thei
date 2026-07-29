<script lang="ts" setup>
import type EditorJS from '@editorjs/editorjs';
import type { OutputData } from '@editorjs/editorjs';
import type {
  AssetReplaceResult,
  AssetVariantInfo,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import { AssetType, assetSourceName } from '#layers/thei/shared/asset';
import {
  ContentValidationError,
  collectContentAssetSizeMap,
  contentDataIsSemanticallyEqual,
  extractContentAssetRefs,
  normalizeContentData,
  summarizeContentData,
  type ContentAssetData,
  type ContentFieldModelValue,
  type ContentOutputData,
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
  PrivateAccessTune,
  type ContentEditorAssetKind,
  type ContentEditorEditGalleryItem,
} from '#layers/thei/app/components/content/editor-tools';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';

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
let editor: EditorJS | undefined;
let cleanupEditorDrag: (() => void) | undefined;

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
      privateAccess: {
        class: PrivateAccessTune,
        config: {
          labels: contentToolLabels(),
        },
      },
    },
  });

  await editor.isReady;
  cleanupEditorDrag = setupBlockDrag(holder.value!, editor);
});

onBeforeUnmount(() => {
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
    if (contentDataIsSemanticallyEqual(data, props.modalData.value?.data)) {
      emit('modalResult', { type: 'unchanged' });
      return;
    }
    const summary = summarizeContentData(
      data,
      collectContentAssetSizeMap(data),
    );
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
  const draftCounts = countRefsByAsset(draft);
  const savedCounts = countRefsByAsset(saved);
  const keys = new Set([...draftCounts.keys(), ...savedCounts.keys()]);
  return Object.fromEntries(
    Array.from(keys, (assetUuid) => [
      assetUuid,
      (draftCounts.get(assetUuid) ?? 0) - (savedCounts.get(assetUuid) ?? 0),
    ]),
  );
}

function countRefsByAsset(data: ContentOutputData) {
  const result = new Map<string, number>();
  for (const ref of extractContentAssetRefs(data)) {
    result.set(ref.assetUuid, (result.get(ref.assetUuid) ?? 0) + 1);
  }
  return result;
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

function setupBlockDrag(root: HTMLElement, editor: EditorJS) {
  const longPressMs = 180;
  const moveThreshold = 6;
  let allowNativeSettingsMouseDown = false;
  let dragState:
    | {
        pointerId: number;
        settingsButton: HTMLElement;
        sourceIndex: number;
        dropIndex: number;
        startX: number;
        startY: number;
        dragging: boolean;
        longPressTimer?: number;
      }
    | undefined;

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const settingsButton = settingsButtonFromEvent(event);
    if (!settingsButton) return;

    const sourceIndex = findBlockIndexByY(root, verticalCenter(settingsButton));
    if (sourceIndex === -1) return;

    event.preventDefault();
    dragState = {
      pointerId: event.pointerId,
      settingsButton,
      sourceIndex,
      dropIndex: sourceIndex,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      longPressTimer: window.setTimeout(() => {
        startDragging();
      }, longPressMs),
    };

    try {
      settingsButton.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }
    root.classList.add('content-editor--settings-pressed');
  }

  function onMouseDownCapture(event: MouseEvent) {
    if (allowNativeSettingsMouseDown || !settingsButtonFromEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const moved = Math.hypot(
      event.clientX - dragState.startX,
      event.clientY - dragState.startY,
    );
    if (!dragState.dragging && moved >= moveThreshold) {
      startDragging();
    }
    if (!dragState.dragging) return;

    event.preventDefault();
    const dropTarget = findBlockDropTarget(
      root,
      event.clientY,
      dragState.sourceIndex,
    );
    dragState.dropIndex = dropTarget?.dropIndex ?? dragState.sourceIndex;
    updateDraggedBlockClasses(root, dragState.sourceIndex, dropTarget);
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const state = dragState;
    const shouldOpenSettings = !state.dragging;
    const shouldMove = state.dragging && state.dropIndex !== state.sourceIndex;
    finishDragState();

    if (shouldOpenSettings) {
      openSettingsWithNativeHandler(state.settingsButton, event);
    } else if (shouldMove) {
      editor.blocks.move(state.dropIndex, state.sourceIndex);
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    finishDragState();
  }

  function startDragging() {
    if (!dragState || dragState.dragging) return;
    dragState.dragging = true;
    window.clearTimeout(dragState.longPressTimer);
    editor.toolbar.toggleBlockSettings(false);
    root.classList.add('content-editor--dragging-block');
    document.body.classList.add('content-editor-block-dragging');
    updateDraggedBlockClasses(root, dragState.sourceIndex, null);
  }

  function finishDragState() {
    if (!dragState) return;
    window.clearTimeout(dragState.longPressTimer);
    try {
      dragState.settingsButton.releasePointerCapture?.(dragState.pointerId);
    } catch {
      // Safe to ignore: the pointer may have been released by the browser.
    }
    dragState = undefined;
    root.classList.remove(
      'content-editor--settings-pressed',
      'content-editor--dragging-block',
    );
    document.body.classList.remove('content-editor-block-dragging');
    updateDraggedBlockClasses(root, -1, null);
  }

  function openSettingsWithNativeHandler(
    settingsButton: HTMLElement,
    event: PointerEvent,
  ) {
    try {
      allowNativeSettingsMouseDown = true;
      settingsButton.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          clientX: event.clientX,
          clientY: event.clientY,
        }),
      );
    } finally {
      allowNativeSettingsMouseDown = false;
    }
  }

  root.addEventListener('pointerdown', onPointerDown, { capture: true });
  root.addEventListener('mousedown', onMouseDownCapture, { capture: true });
  window.addEventListener('pointermove', onPointerMove, { capture: true });
  window.addEventListener('pointerup', onPointerUp, { capture: true });
  window.addEventListener('pointercancel', onPointerCancel, { capture: true });

  return () => {
    finishDragState();
    root.removeEventListener('pointerdown', onPointerDown, { capture: true });
    root.removeEventListener('mousedown', onMouseDownCapture, {
      capture: true,
    });
    window.removeEventListener('pointermove', onPointerMove, { capture: true });
    window.removeEventListener('pointerup', onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', onPointerCancel, {
      capture: true,
    });
  };
}

function settingsButtonFromEvent(event: Event): HTMLElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>('.ce-toolbar__settings-btn')
    : null;
}

function verticalCenter(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function findBlockIndexByY(root: HTMLElement, y: number): number {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.ce-block'));
  if (!blocks.length) return -1;

  for (let index = 0; index < blocks.length; index++) {
    const rect = blocks[index]!.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return index;
  }

  return blocks.length - 1;
}

type BlockDropTarget = {
  blockIndex: number;
  dropIndex: number;
  position: 'before' | 'after';
};

function findBlockDropTarget(
  root: HTMLElement,
  y: number,
  sourceIndex: number,
): BlockDropTarget | null {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.ce-block'));
  if (blocks.length < 2) return null;

  let slotIndex = blocks.length;
  let blockIndex = blocks.length - 1;
  let position: BlockDropTarget['position'] = 'after';

  for (let index = 0; index < blocks.length; index++) {
    const rect = blocks[index]!.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      slotIndex = index;
      blockIndex = index;
      position = 'before';
      break;
    }
  }

  if (slotIndex === sourceIndex) {
    return {
      blockIndex: sourceIndex,
      dropIndex: sourceIndex,
      position: 'before',
    };
  }

  if (slotIndex === sourceIndex + 1) {
    return {
      blockIndex: sourceIndex,
      dropIndex: sourceIndex,
      position: 'after',
    };
  }

  const dropIndex = sourceIndex < slotIndex ? slotIndex - 1 : slotIndex;
  if (dropIndex < 0 || dropIndex >= blocks.length) return null;

  return { blockIndex, dropIndex, position };
}

function updateDraggedBlockClasses(
  root: HTMLElement,
  sourceIndex: number,
  dropTarget: BlockDropTarget | null,
) {
  root.querySelectorAll<HTMLElement>('.ce-block').forEach((block, index) => {
    block.classList.toggle(
      'content-editor-block-dragging-source',
      index === sourceIndex,
    );
    block.classList.toggle(
      'content-editor-block-drop-before',
      dropTarget?.blockIndex === index && dropTarget.position === 'before',
    );
    block.classList.toggle(
      'content-editor-block-drop-after',
      dropTarget?.blockIndex === index && dropTarget.position === 'after',
    );
  });
}
</script>

<template>
  <ModalWindow
    :title="modalData.title"
    width="56rem"
    max-height="calc(100dvh - var(--spacing-window) - var(--spacing-window))"
  >
    <template #header-actions>
      <div v-if="errorMessage" class="truncate text-sm text-text-error">
        {{ errorMessage }}
      </div>
      <Button class="font-semibold" :disabled="saving" @click="save">
        <Icon v-if="saving" name="loading" class="mr-xs" />
        <span>{{ phrase.save }}</span>
      </Button>
    </template>

    <div ref="holder" class="content-editor w-full px-sm py-md"></div>
  </ModalWindow>
</template>
