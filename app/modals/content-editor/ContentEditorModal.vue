<script lang="ts" setup>
import type EditorJS from '@editorjs/editorjs';
import type { OutputData } from '@editorjs/editorjs';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import {
  ContentValidationError,
  collectContentAssetSizeMap,
  normalizeContentData,
  summarizeContentData,
  type ContentFieldModelValue,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import {
  launchAssetWizard,
  mapAssetVariantToReplaceResult,
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
  ContentImageTool,
  PrivateAccessTune,
  type ContentEditorAssetKind,
} from '#layers/thei/app/components/content/editor-tools';

type ContentEditorResult = {
  type: 'save';
  value: ContentFieldModelValue;
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
      contentImage: {
        class: ContentImageTool,
        config: {
          pickAsset,
          labels: contentToolLabels(),
        },
      },
      contentGallery: {
        class: ContentGalleryTool,
        config: {
          pickAsset,
          labels: contentToolLabels(),
        },
      },
      contentAttachment: {
        class: ContentAttachmentTool,
        config: {
          pickAsset,
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
  const asset =
    kind === 'media'
      ? await launchContentAssetWizard({
          accept: [imageExtensionProfile, videoExtensionProfile],
          maxSize: ASSET_UPLOAD_LIMITS['project-media'],
          sizeLimitPolicy: 'project-media',
        })
      : await launchContentAssetWizard({
          accept: anyFileExtensionProfile,
          maxSize: ASSET_UPLOAD_LIMITS['project-other'],
          sizeLimitPolicy: 'project-other',
        });

  return asset ? mapAsset(asset) : undefined;
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
    type: asset.type,
    extension: asset.extension,
    size: asset.size,
    previewUrl: result.previewUrl,
    videoUrl: result.videoUrl,
    assetUrl: result.assetUrl,
    archivedOriginal:
      asset.type === AssetType.Other &&
      asset.meta &&
      'archivedOriginal' in asset.meta
        ? asset.meta.archivedOriginal
        : undefined,
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
    galleryCaption: phrase.value.content_gallery_caption,
    title: phrase.value.content_title,
    description: phrase.value.content_description,
    remove: phrase.value.content_remove,
    privateAccess: phrase.value.asset_private_access,
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

    <div class="mx-auto w-full max-w-190">
      <div
        ref="holder"
        class="content-editor rounded-normal border border-border-1 bg-bg-1
          px-sm py-md"
      ></div>
    </div>
  </ModalWindow>
</template>
