<script lang="ts" setup>
import type EditorJS from '@editorjs/editorjs';
import type {
  API,
  BlockMutationEvent,
  InlineToolConstructable,
  OutputData,
} from '@editorjs/editorjs';
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
  contentSemanticKey,
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
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalTitle from '#layers/thei/app/modals/ModalTitle.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import FloatingPopup from '#layers/thei/app/components/FloatingPopup.vue';
import ContentStats from '#layers/thei/app/components/content/ContentStats.vue';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';
import ContentInlineLinkControls from '#layers/thei/app/components/content/ContentInlineLinkControls.vue';
import ContentEntitySearchPopup from '#layers/thei/app/components/content/ContentEntitySearchPopup.vue';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import {
  ContentAttachmentTool,
  ContentBoldTool,
  ContentGalleryTool,
  ContentItalicTool,
  ContentEntityLinkTool,
  ContentExternalInlineLinkTool,
  ContentMediaTool,
  ExternalLinkTool,
  EntityLinkTool,
  PrivateAccessTune,
  type ContentEditorAssetKind,
} from '#layers/thei/app/components/content/editor-tools';
import type {
  ContentInlineLinkControlsExpose,
  ContentInlineLinkRequest,
} from '#layers/thei/app/components/content/editor-inline-links';
import { editorIcon } from '#layers/thei/app/components/content/editor-icons';
import { ContentDelimiterTool } from '#layers/thei/app/components/content/editor-delimiter-tool';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { createEditorBlockDrag } from '#layers/thei/app/composables/editor-block-drag';
import { createEditorPopoverLayer } from '#layers/thei/app/composables/editor-popover-layer';
import { useContentLinkResolver } from '#layers/thei/app/composables/content-link-resolver';
import {
  createEditorSnapshotManager,
  groupEditorSnapshotsByDay,
  readCleanEditorOutput,
  type EditorSnapshotReference,
} from '#layers/thei/app/composables/editor-snapshots';

const props = defineProps<{
  modalData: {
    title?: string;
    value?: ContentFieldModelValue | null;
    snapshotKey: string;
    onSave: (value: ContentFieldModelValue) => void;
  };
}>();

const holder = useTemplateRef<HTMLElement>('holder');
const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
const inlineLinkControls =
  useTemplateRef<ContentInlineLinkControlsExpose>('inlineLinkControls');
const contentLinkResolver = useContentLinkResolver();
const entityPickerOpen = ref(false);
const entityPickerAnchor = ref<HTMLElement>();
const entityPicker = useTemplateRef<{ focus: () => void }>('entityPicker');
let entityPickerResolve: ((item?: ContentEntitySearchItem) => void) | undefined;
const saving = ref(false);
const errorMessage = ref<string | undefined>();
const snapshotPopupOpen = ref(false);
const snapshotButton = useTemplateRef<HTMLElement>('snapshotButton');
const initialData = normalizeContentData(props.modalData.value?.data);
let savedValue = props.modalData.value;
const {
  value: draftData,
  isDirty,
  markSaved,
} = useSerializableState(initialData, { serialize: contentSemanticKey });
const computedInitialSummary = summarizeContentData(
  initialData,
  collectContentAssetSizeMap(initialData),
);
const headerSummary = ref<ContentSummary>({
  blockCount:
    props.modalData.value?.blockCount ?? computedInitialSummary.blockCount,
  wordCount: computedInitialSummary.wordCount,
  assetCount:
    props.modalData.value?.assetCount ?? computedInitialSummary.assetCount,
  assetTotalSize:
    props.modalData.value?.assetTotalSize ??
    computedInitialSummary.assetTotalSize,
});
let editor: EditorJS | undefined;
let editorAcceptsChanges = false;
let transientEntitySelections = 0;
let cleanupEditorDrag: (() => void) | undefined;
let cleanupEditorPopoverLayer: (() => void) | undefined;

function pickEntity(anchor: HTMLElement) {
  entityPickerResolve?.();
  entityPickerAnchor.value = anchor;
  entityPickerOpen.value = true;
  return new Promise<ContentEntitySearchItem | undefined>((resolve) => {
    entityPickerResolve = resolve;
  });
}

function selectEntity(item: ContentEntitySearchItem) {
  const resolve = entityPickerResolve;
  entityPickerResolve = undefined;
  entityPickerOpen.value = false;
  resolve?.(item);
}

function closeEntityPicker() {
  const resolve = entityPickerResolve;
  entityPickerResolve = undefined;
  entityPickerAnchor.value = undefined;
  resolve?.();
}

const editorSnapshots = createEditorSnapshotManager({
  storageKey: props.modalData.snapshotKey,
  read: async () => {
    if (!editor) throw new Error('Content editor is not available.');
    return readCleanEditorOutput(editor);
  },
  render: async (data) => {
    if (!editor) throw new Error('Content editor is not available.');
    await editor.render(data as OutputData);
    editor.toolbar.close();
  },
  onCurrentChange: applyEditorData,
  onError: () => {
    errorMessage.value = phrase.value.content_editor_save_error;
  },
});
const editorChangePending = editorSnapshots.isPending;
const snapshots = editorSnapshots.snapshots;
const snapshotGroups = computed(() =>
  groupEditorSnapshotsByDay(snapshots.value),
);

async function handleEditorChange(
  _api: API,
  _event: BlockMutationEvent | BlockMutationEvent[],
) {
  if (
    !editorAcceptsChanges ||
    editorSnapshots.isApplying.value ||
    transientEntitySelections > 0
  )
    return;
  editorSnapshots.recordChange();
}

function beginTransientEntitySelection() {
  transientEntitySelections += 1;
}

function endTransientEntitySelection(persisted: boolean) {
  if (persisted) {
    transientEntitySelections = Math.max(0, transientEntitySelections - 1);
    return;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      transientEntitySelections = Math.max(0, transientEntitySelections - 1);
    }),
  );
}

function applyEditorData(data: ContentOutputData) {
  draftData.value = data;
  headerSummary.value = summarizeContentData(
    data,
    collectContentAssetSizeMap(data),
  );
}

async function restoreSnapshot(snapshot: EditorSnapshotReference) {
  if (await editorSnapshots.restore(snapshot)) snapshotPopupOpen.value = false;
}

function snapshotTime(createdAt: number) {
  return new Intl.DateTimeFormat(language.value.code, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(createdAt);
}

function snapshotLabel(createdAt: number) {
  return phrase.value.content_snapshot_restore_label(
    new Intl.DateTimeFormat(language.value.code, {
      dateStyle: 'medium',
      timeStyle: 'short',
      hourCycle: 'h23',
    }).format(createdAt),
  );
}

function snapshotDayLabel(dayStart: number) {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayStart === todayStart || dayStart === yesterday.getTime()) {
    return new Intl.RelativeTimeFormat(language.value.code, {
      numeric: 'auto',
    }).format(dayStart === todayStart ? 0 : -1, 'day');
  }
  return new Intl.DateTimeFormat(language.value.code, {
    dateStyle: 'long',
  }).format(dayStart);
}

useModalCloseGuard(
  () =>
    (!editorChangePending.value && !isDirty.value) ||
    window.confirm(phrase.value.unsaved_modal_confirm),
);

function preventEditorLinkNavigation(event: MouseEvent) {
  if (event.type === 'auxclick' && event.button !== 1) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest('a[href]');
  if (link && holder.value?.contains(link)) event.preventDefault();
}

function preventHeaderFormatting(event: InputEvent) {
  if (
    event.inputType.startsWith('format') ||
    event.inputType === 'insertLink'
  ) {
    event.preventDefault();
  }
}

function normalizeHeaderInput(event: Event) {
  if (event instanceof InputEvent && event.isComposing) return;
  normalizeHeaderElement(event);
}

function normalizeHeaderElement(event: Event) {
  const element = event.currentTarget;
  if (!(element instanceof HTMLHeadingElement) || !element.querySelector('*')) {
    return;
  }

  const selection = window.getSelection();
  const selectionIsInside = Boolean(
    selection?.anchorNode &&
    selection.focusNode &&
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode),
  );
  const anchorOffset = selectionIsInside
    ? headerTextOffset(element, selection!.anchorNode!, selection!.anchorOffset)
    : 0;
  const focusOffset = selectionIsInside
    ? headerTextOffset(element, selection!.focusNode!, selection!.focusOffset)
    : 0;
  const text = element.textContent ?? '';
  element.textContent = text;

  if (!selectionIsInside || !selection) return;
  const textNode =
    element.firstChild ?? element.appendChild(document.createTextNode(''));
  selection.setBaseAndExtent(
    textNode,
    Math.min(anchorOffset, text.length),
    textNode,
    Math.min(focusOffset, text.length),
  );
}

function headerTextOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
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

  class PlainTextHeader extends Header {
    override getTag() {
      const element = super.getTag();
      element.addEventListener('beforeinput', preventHeaderFormatting);
      element.addEventListener('input', normalizeHeaderInput);
      element.addEventListener('compositionend', normalizeHeaderElement);
      return element;
    }
  }

  class TheiList extends List {
    override renderSettings() {
      const settings = super.renderSettings();
      const styleIcons = [
        editorIcon('list-unordered'),
        editorIcon('list-ordered'),
        editorIcon('list-check'),
      ];

      return settings.map((setting, index) =>
        index < styleIcons.length
          ? { ...setting, icon: styleIcons[index] }
          : setting,
      );
    }
  }

  editor = new Editor({
    holder: holder.value!,
    data: toEditorData(props.modalData.value?.data),
    onChange: handleEditorChange,
    placeholder: phrase.value.content_editor_placeholder,
    i18n: {
      messages: editorJsI18nMessages(),
    },
    minHeight: 240,
    inlineToolbar: [
      'contentBold',
      'contentItalic',
      'contentEntityLink',
      'contentExternalInlineLink',
    ],
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
        'data-content-link': true,
        'data-entity-type': true,
        'data-entity-id': true,
      },
      br: true,
    },
    tunes: ['privateAccess'],
    tools: {
      contentBold: {
        class: ContentBoldTool as unknown as InlineToolConstructable,
      },
      contentItalic: {
        // Editor.js 2.x still types constructable render() as HTMLElement even
        // though its current InlineTool API accepts MenuConfig.
        class: ContentItalicTool as unknown as InlineToolConstructable,
      },
      contentEntityLink: {
        class: ContentEntityLinkTool as unknown as InlineToolConstructable,
        config: {
          open: (request: ContentInlineLinkRequest) =>
            inlineLinkControls.value?.openProject(request),
        },
      },
      contentExternalInlineLink: {
        class:
          ContentExternalInlineLinkTool as unknown as InlineToolConstructable,
        config: {
          open: (request: ContentInlineLinkRequest) =>
            inlineLinkControls.value?.openExternal(request),
        },
      },
      paragraph: {
        toolbox: {
          title: phrase.value.content_editor_i18n.text,
          icon: editorIcon('paragraph'),
        },
      },
      header: {
        class: PlainTextHeader,
        toolbox: [
          {
            title: phrase.value.content_editor_i18n.heading,
            icon: editorIcon('heading'),
            data: { level: 2 },
          },
          {
            title: phrase.value.content_editor_i18n.subheading,
            icon: editorIcon('subheading'),
            data: { level: 3 },
          },
        ],
        inlineToolbar: false,
        config: {
          levels: [2, 3],
          defaultLevel: 2,
        },
      },
      list: {
        class: TheiList,
        toolbox: {
          title: phrase.value.content_editor_i18n.list,
          icon: editorIcon('list-unordered'),
          data: { style: 'unordered' },
        },
        inlineToolbar: true,
        config: {
          defaultStyle: 'unordered',
        },
      },
      quote: {
        class: Quote,
        inlineToolbar: true,
        toolbox: {
          title: phrase.value.content_editor_i18n.quote,
          icon: editorIcon('quote'),
        },
      },
      delimiter: {
        class: ContentDelimiterTool,
        toolbox: {
          title: phrase.value.content_editor_i18n.delimiter,
          icon: editorIcon('asterisk'),
        },
      },
      contentMedia: {
        class: ContentMediaTool,
        inlineToolbar: true,
        config: {
          pickAsset,
          editAsset,
          labels: contentToolLabels(),
        },
      },
      contentGallery: {
        class: ContentGalleryTool,
        inlineToolbar: true,
        config: {
          pickAssets,
          editAsset,
          labels: contentToolLabels(),
        },
      },
      contentAttachment: {
        class: ContentAttachmentTool,
        inlineToolbar: false,
        config: {
          pickAsset,
          editAsset,
          labels: contentToolLabels(),
        },
      },
      externalLink: {
        class: ExternalLinkTool,
        config: {
          labels: contentToolLabels(),
        },
      },
      entityLink: {
        class: EntityLinkTool,
        config: {
          pickEntity,
          resolver: contentLinkResolver,
          beginTransientSelection: beginTransientEntitySelection,
          endTransientSelection: endTransientEntitySelection,
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
  await editorSnapshots.initialize();
  editorAcceptsChanges = true;
  cleanupEditorPopoverLayer = createEditorPopoverLayer(holder.value!);
  cleanupEditorDrag = createEditorBlockDrag(holder.value!, editor);
});

onBeforeUnmount(() => {
  editorAcceptsChanges = false;
  editorSnapshots.destroy();
  cleanupEditorPopoverLayer?.();
  cleanupEditorPopoverLayer = undefined;
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
  if (!editor || saving.value || !isDirty.value) return;
  saving.value = true;
  errorMessage.value = undefined;
  try {
    const data = await editorSnapshots.synchronize();
    draftData.value = data;
    if (contentDataIsSemanticallyEqual(data, savedValue?.data)) {
      markSaved(data);
      return;
    }
    const summary = summarizeContentData(
      data,
      collectContentAssetSizeMap(data),
    );
    markSaved(data);
    savedValue = {
      contentUuid: savedValue?.contentUuid,
      updatedAt: savedValue?.updatedAt,
      data,
      ...summary,
    };
    headerSummary.value = summary;
    props.modalData.onSave(savedValue);
  } catch (error) {
    errorMessage.value =
      error instanceof ContentValidationError
        ? error.message
        : phrase.value.content_editor_save_error;
  } finally {
    saving.value = false;
  }
}

useSaveShortcut(save, {
  canSave: () => Boolean(editor) && !saving.value && isDirty.value,
  root: () => modalContainer.value?.root,
  exclusive: true,
});

async function clearContent() {
  if (!editor || headerSummary.value.blockCount === 0) return;
  if (!window.confirm(phrase.value.content_editor_clear_confirm)) return;
  await editor.clear();
  editorSnapshots.recordChange();
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
  while (true) {
    const result = await openModal(assetDetailsModal, {
      asideTitle: phrase.value.asset,
      asset: contentAssetReplaceResult(current),
    });

    if (result.type === 'replace') {
      const edited = await replaceAsset(current, kind);
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
      `/api/admin/assets/${current.assetUuid}/variants`,
    );
    const stored = response.variants.find(
      (variant) => variant.assetUuid === current.assetUuid,
    );
    if (!stored) return undefined;
    const edited = await launchAssetEditor(stored, {
      ...contentAssetOptions(kind),
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

async function buildDraftUsageDelta() {
  if (!editor) return {};
  const draft = editorSnapshots.current();
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
    removeMedia: phrase.value.delete,
    chooseFile: phrase.value.content_choose_file,
    caption: phrase.value.content_caption,
    mediaCentered: phrase.value.content_media_centered,
    mediaNatural: phrase.value.content_media_natural,
    mediaStretch: phrase.value.content_media_stretch,
    title: phrase.value.content_title,
    description: phrase.value.content_description,
    fileWithExtension: phrase.value.content_file_with_extension,
    privateAccess: phrase.value.content_private_block,
    externalLinkLoading: phrase.value.external_link_loading,
    externalLinkError: phrase.value.external_link_error,
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
      'Project link': phrase.value.content_internal_link,
      'External link': phrase.value.content_external_link,
      'Internal link': phrase.value.content_internal_link,
      Heading: text.heading,
      List: text.list,
      Quote: text.quote,
      Delimiter: text.delimiter,
      Media: text.media,
      Gallery: text.gallery,
      File: text.file,
    },
    tools: {
      link: { 'Add a link': text.add_link },
      header: {
        'Heading 2': text.heading,
        'Heading 3': text.subheading,
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
  <ModalContainer ref="modalContainer" class="max-w-192">
    <ContentInlineLinkDecorator
      :root="holder"
      :resolver="contentLinkResolver"
    />
    <ContentInlineLinkControls
      ref="inlineLinkControls"
      :teleport-to="holder?.closest('dialog') ?? undefined"
    />
    <FloatingPopup
      v-model:open="entityPickerOpen"
      :anchor="entityPickerAnchor ?? null"
      placement="bottom-start"
      :teleport-to="holder?.closest('dialog') ?? undefined"
      @opened="entityPicker?.focus()"
      @closed="closeEntityPicker"
    >
      <ContentEntitySearchPopup ref="entityPicker" @select="selectEntity" />
    </FloatingPopup>
    <template #header>
      <div class="flex flex-col gap-xs p-sm">
        <div class="flex min-w-0 items-center gap-xs">
          <ModalTitle
            icon="edit"
            :title="modalData.title || phrase.content_editor_title"
            class="flex-1"
          />
          <div
            v-if="errorMessage"
            class="min-w-0 truncate text-sm text-text-error"
          >
            {{ errorMessage }}
          </div>
          <ModalHeaderButton
            icon="delete"
            variant="delete"
            :label="phrase.clear"
            :disabled="headerSummary.blockCount === 0"
            @click="clearContent"
          />
          <ModalHeaderButton
            icon="close"
            :label="phrase.close_modal"
            @click="closeModal"
          />
          <ModalHeaderButton
            variant="accent"
            :label="phrase.save"
            :disabled="saving || !isDirty"
            @click="save"
          >
            <Icon v-if="saving" name="loading" />
            {{ isDirty ? phrase.save : phrase.saved }}
          </ModalHeaderButton>
        </div>
        <div class="flex min-w-0 items-center justify-between gap-sm">
          <div class="flex min-w-0 items-center gap-xs">
            <div ref="snapshotButton" class="flex shrink-0">
              <ModalHeaderButton
                icon="history"
                size="compact"
                :label="phrase.content_snapshots"
                :disabled="snapshots.length === 0"
                :aria-expanded="snapshotPopupOpen"
                aria-haspopup="dialog"
                @click="snapshotPopupOpen = !snapshotPopupOpen"
              />
              <FloatingPopup
                v-model:open="snapshotPopupOpen"
                :anchor="snapshotButton"
                placement="bottom-start"
                :teleport-to="holder?.closest('dialog') ?? undefined"
                fit-content
              >
                <div
                  role="dialog"
                  :aria-label="phrase.content_snapshots"
                  class="flex scrollbar-mini
                    max-h-[min(17.5rem,var(--floating-popup-available-height))]
                    w-52 flex-col gap-sm overflow-y-auto rounded-normal border
                    border-border-1 bg-bg-2 p-xs"
                >
                  <div
                    v-for="group in snapshotGroups"
                    :key="group.dayStart"
                    class="flex flex-col gap-xs"
                  >
                    <div
                      class="flex items-center gap-xs text-xs text-text-3
                        first-letter:uppercase"
                    >
                      <span class="h-px grow bg-border-1" />
                      <span>{{ snapshotDayLabel(group.dayStart) }}</span>
                      <span class="h-px grow bg-border-1" />
                    </div>
                    <div class="flex flex-wrap gap-xs">
                      <button
                        v-for="(snapshot, index) in group.snapshots"
                        :key="`${snapshot.createdAt}:${index}`"
                        type="button"
                        :aria-label="snapshotLabel(snapshot.createdAt)"
                        class="cursor-pointer rounded-full bg-bg-3 px-xs py-1
                          text-xs text-text-2 transition-colors
                          hocus:bg-bg-accent hocus:text-accent"
                        @click="restoreSnapshot(snapshot)"
                      >
                        {{ snapshotTime(snapshot.createdAt) }}
                      </button>
                    </div>
                  </div>
                </div>
              </FloatingPopup>
            </div>
            <ContentStats v-bind="headerSummary" />
          </div>
          <span class="shrink-0 text-xs text-text-3">
            <TheiTime
              v-if="modalData.value?.updatedAt"
              :datetime="modalData.value.updatedAt"
            />
            <template v-else>{{ phrase.content_never_saved }}</template>
          </span>
        </div>
      </div>
    </template>

    <div
      ref="holder"
      class="content-editor content-prose w-full px-sm py-md"
      @click.capture="preventEditorLinkNavigation"
      @auxclick.capture="preventEditorLinkNavigation"
    ></div>
  </ModalContainer>
</template>
