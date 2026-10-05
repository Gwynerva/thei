<script lang="ts" setup>
import type EditorJS from '@editorjs/editorjs';
import type {
  API,
  BlockMutationEvent,
  InlineToolConstructable,
  OutputData,
  ToolConstructable,
} from '@editorjs/editorjs';
import type {
  AssetReplaceResult,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
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
  acceptedExtensionsFromAccept,
  contentAssetFromVariant,
  launchAssetBatchWizard,
  launchAssetEditor,
  launchPendingFileEditor,
  type AssetWizardOptions,
} from '#layers/thei/app/composables/asset-wizard';
import { bindEditorMediaPaste } from '#layers/thei/app/composables/editor-media-paste';
import {
  anyFileExtensionProfile,
  audioExtensionProfile,
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
import ContentHintControls from '#layers/thei/app/components/content/ContentHintControls.vue';
import ContentEntitySearchPopup from '#layers/thei/app/components/content/ContentEntitySearchPopup.vue';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import {
  ContentAttachmentTool,
  ContentAudioTool,
  ContentBoldTool,
  ContentHintTool,
  ContentStrikeTool,
  ContentGalleryTool,
  ContentItalicTool,
  ContentEntityLinkTool,
  ContentExternalInlineLinkTool,
  ContentMediaTool,
  ExternalLinkTool,
  IntegrationTool,
  entityLinkToolWithPaste,
  PrivateSectionBoundaryTool,
  type ContentEditorAssetKind,
  type ContentEditorUploads,
} from '#layers/thei/app/components/content/editor-tools';
import type {
  ContentHintControlsExpose,
  ContentHintRequest,
  ContentInlineLinkControlsExpose,
  ContentInlineLinkRequest,
} from '#layers/thei/app/components/content/editor-inline-links';
import { editorIcon } from '#layers/thei/app/components/content/editor-icons';
import { ContentDelimiterTool } from '#layers/thei/app/components/content/editor-delimiter-tool';
import {
  ContentSpoilerTune,
  type ContentSpoilerTuneConfig,
} from '#layers/thei/app/components/content/editor-spoiler-tune';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { createEditorBlockDrag } from '#layers/thei/app/composables/editor-block-drag';
import { bindEditorGutterClick } from '#layers/thei/app/composables/editor-gutter-click';
import { bindEditorCurrentBlock } from '#layers/thei/app/composables/editor-current-block';
import { bindEditorLinkPaste } from '#layers/thei/app/composables/editor-link-paste';
import { bindEditorKeyboardBoundary } from '#layers/thei/app/composables/editor-keyboard-boundary';
import { createEditorPrivateSections } from '#layers/thei/app/composables/editor-private-sections';
import { createEditorPrivatePattern } from '#layers/thei/app/composables/editor-private-pattern';
import { createEditorPopoverLayer } from '#layers/thei/app/composables/editor-popover-layer';
import {
  invalidateContentLinks,
  useContentLinkResolver,
} from '#layers/thei/app/composables/content-link-resolver';
import { useExternalLinks } from '#layers/thei/app/composables/external-links';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import { internalUrlPastePattern } from '#layers/thei/shared/internal-url';
import { readCleanEditorOutput } from '#layers/thei/app/composables/editor-output';
import {
  createEditorHistorySession,
  type EditorHistoryCurrent,
} from '#layers/thei/app/composables/content-history/session';
import {
  announceContentHistoryChange,
  contentHistoryTransport,
  joinContentHistoryTabs,
} from '#layers/thei/app/composables/content-history/api';
import { useContentHistoryBuffer } from '#layers/thei/app/composables/content-history/buffer';
import {
  isNewContentOwnerRef,
  type ContentHistoryEntryMeta,
  type ContentHistoryField,
} from '#layers/thei/shared/content-history';
import ContentHistoryPanel from '#layers/thei/app/components/content/ContentHistoryPanel.vue';
import ContentRestoreBar from '#layers/thei/app/components/content/ContentRestoreBar.vue';
import {
  offerRestoreTarget,
  type RestoreTarget,
} from '#layers/thei/app/composables/content-history/restore-target';
import ContentHistoryDiff from '#layers/thei/app/components/content/ContentHistoryDiff.vue';
import { historyTime } from '#layers/thei/app/composables/content-history/time-labels';

const props = defineProps<{
  modalData: {
    title?: string;
    value?: ContentFieldModelValue | null;
    /**
     * Where the field's draft and versions live. Without it the editor keeps
     * no history.
     */
    history?: {
      field: ContentHistoryField;
      /**
       * The latest draft written for another new owner, offered to a field
       * whose owner is not created yet. Read as it changes.
       */
      pending?: () => ContentHistoryEntryMeta | undefined;
    };
    onSave: (value: ContentFieldModelValue) => void;
    /**
     * Called once the content has been written back into the form behind the
     * editor. The form decides for itself whether that was the only change
     * and whether it can therefore save the whole entity.
     */
    onSaved?: () => void | Promise<void>;
    /**
     * The field's value as the form holds it now. The form stamps its content
     * once the entity behind it is saved, which may happen while the editor
     * is still open; this is how the editor shows that time without reopening.
     */
    current?: () => ContentFieldModelValue | null | undefined;
  };
}>();

const holder = useTemplateRef<HTMLElement>('holder');
const updatedAt = computed(
  () =>
    (props.modalData.current
      ? props.modalData.current()?.updatedAt
      : undefined) ?? props.modalData.value?.updatedAt,
);
let cleanupSmartTypography: (() => void) | undefined;
let cleanupMediaPaste: (() => void) | undefined;
let cleanupGutterClick: (() => void) | undefined;
let cleanupCurrentBlock: (() => void) | undefined;
let cleanupLinkPaste: (() => void) | undefined;
let cleanupKeyboardBoundary: (() => void) | undefined;
/**
 * Editor.js switches to its mobile layout at this width — its own constant,
 * not the project's breakpoint — and the styling follows the same switch, so
 * the two never disagree about where the toolbar is.
 */
const EDITOR_MOBILE_LAYOUT_QUERY = '(max-width: 650px)';
let editorLayoutQuery: MediaQueryList | undefined;

function applyEditorLayout() {
  const layout = editorLayoutQuery?.matches ? 'mobile' : 'desktop';
  holder.value?.setAttribute('data-content-editor-layout', layout);
  // The body too: Editor.js measures a popover on a clone appended there.
  document.body.setAttribute('data-content-editor-layout', layout);
}
const modalContainer =
  useTemplateRef<InstanceType<typeof ModalContainer>>('modalContainer');
const inlineLinkControls =
  useTemplateRef<ContentInlineLinkControlsExpose>('inlineLinkControls');
const hintControls = useTemplateRef<ContentHintControlsExpose>('hintControls');
// The editor may open again on the page where its links' targets were just
// saved or removed; it asks about them afresh.
invalidateContentLinks();
const contentLinkResolver = useContentLinkResolver('admin');
// The records of the links the content came with, so no block asks again.
const externalLinks = useExternalLinks();
externalLinks.seed(
  (props.modalData.value?.data?.blocks ?? [])
    .filter((block) => block.type === 'externalLink')
    .map((block) => block.data as Partial<ExternalLink>),
);
const internalSite = useInternalUrlSite();
const entityPickerOpen = ref(false);
const entityPickerAnchor = ref<HTMLElement>();
const entityPicker = useTemplateRef<{ focus: () => void }>('entityPicker');
let entityPickerResolve: ((item?: ContentEntitySearchItem) => void) | undefined;
const saving = ref(false);
const errorMessage = ref<string | undefined>();
const historyPopupOpen = ref(false);
const historyButton = useTemplateRef<HTMLElement>('historyButton');
const restoredLabel = ref('');
/** What a restore is being confirmed for, in the header's third row. */
const restoring = shallowRef<{ target: RestoreTarget; fromList: boolean }>();
/**
 * While a restore is being confirmed, the text is shown read-only in the
 * editor's place, marked with what the restore would change. The editor
 * itself is left alone and is back as it was when the question is gone.
 */
const diff = shallowRef<{
  current: ContentOutputData;
  version: ContentOutputData;
}>();

function showDiff(version: ContentOutputData | undefined) {
  diff.value = version
    ? { current: editorSession.current(), version }
    : undefined;
}
const initialData = normalizeContentData(props.modalData.value?.data);
const openedKey = contentSemanticKey(initialData);
const opened = { data: initialData, key: openedKey };
let savedValue = props.modalData.value;
/**
 * The editor is dirty while what it holds differs from what it last wrote
 * into the form. Both are semantic keys the session computes anyway, so a
 * change is not serialized a second time just to be compared.
 */
const currentKey = shallowRef(openedKey);
const savedKey = shallowRef(openedKey);
const isDirty = computed(() => currentKey.value !== savedKey.value);
/** Set once the owner confirmed closing with unsaved changes. */
let discardConfirmed = false;
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
/** Set once the modal is on its way out, so an editor still loading stops. */
let disposed = false;
let editorAcceptsChanges = false;
let transientEntitySelections = 0;
let cleanupEditorDrag: (() => void) | undefined;
let cleanupEditorPopoverLayer: (() => void) | undefined;
let cleanupEditorPrivatePattern: (() => void) | undefined;
let editorPrivateSections:
  ReturnType<typeof createEditorPrivateSections> | undefined;

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

const hasHistory = Boolean(props.modalData.history);
if (hasHistory) joinContentHistoryTabs();
const editorSession = createEditorHistorySession({
  read: async () => {
    if (!editor) throw new Error('Content editor is not available.');
    return readCleanEditorOutput(editor);
  },
  render: async (data) => {
    if (!editor) throw new Error('Content editor is not available.');
    editorPrivateSections?.resetSuppression();
    try {
      await editor.render(data as OutputData);
    } finally {
      editorPrivateSections?.resetSuppression();
    }
    editorPrivateSections?.refresh();
    editor.toolbar.close();
  },
  onCurrentChange: applyEditorData,
  onError: (_error, kind) => {
    errorMessage.value =
      kind === 'restore'
        ? phrase.value.content_history_load_error
        : phrase.value.content_editor_save_error;
  },
  history: props.modalData.history
    ? {
        field: props.modalData.history.field,
        transport: contentHistoryTransport,
        buffer: useContentHistoryBuffer(),
        pending: props.modalData.history.pending,
      }
    : undefined,
});
const editorChangePending = editorSession.isPending;
const historyStatus = editorSession.status;
const draftOffer = editorSession.offer;
const lastRestore = editorSession.lastRestore;
const historyStatusText = computed(() => {
  if (!hasHistory) return '';
  if (historyStatus.value === 'offline')
    return phrase.value.content_draft_status_offline;
  if (historyStatus.value === 'refused')
    return phrase.value.content_draft_status_refused;
  // Text equal to what the form holds needs no reassurance.
  if (!isDirty.value) return '';
  const syncedAt = editorSession.lastSyncedAt.value;
  return syncedAt
    ? phrase.value.content_draft_status_synced(historyTime(syncedAt))
    : '';
});
const undoLabel = computed(() =>
  lastRestore.value
    ? `${phrase.value.content_restore_undo} · ${phrase.value.content_restored(restoredLabel.value)}`
    : '',
);
/** When the offered draft was last written; it follows the other tab. */
const offerUpdatedAt = computed(() => {
  const offer = draftOffer.value;
  if (!offer) return undefined;
  return offer.kind === 'server' ? offer.meta.updatedAt : offer.updatedAt;
});
const offerTime = computed(() =>
  offerUpdatedAt.value ? historyTime(offerUpdatedAt.value) : '',
);

async function handleEditorChange(
  _api: API,
  event: BlockMutationEvent | BlockMutationEvent[],
) {
  if (
    !editorAcceptsChanges ||
    editorSession.isApplying.value ||
    transientEntitySelections > 0
  )
    return;
  if (editorPrivateSections && !editorPrivateSections.handleChange(event))
    return;
  editorSession.recordChange();
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

function applyEditorData(state: EditorHistoryCurrent) {
  currentKey.value = state.key;
  headerSummary.value = state.summary;
}

function toggleHistory() {
  if (historyPopupOpen.value) {
    historyPopupOpen.value = false;
    return;
  }
  closeRestore();
  historyPopupOpen.value = true;
}

function chooseVersion(target: RestoreTarget) {
  historyPopupOpen.value = false;
  restoring.value = { target, fromList: true };
}

function openOffer() {
  if (!draftOffer.value) return;
  historyPopupOpen.value = false;
  restoring.value = {
    target: offerRestoreTarget(draftOffer.value, editorSession),
    fromList: false,
  };
}

function backToList() {
  closeRestore();
  historyPopupOpen.value = true;
}

function closeRestore() {
  restoring.value = undefined;
  diff.value = undefined;
}

function dismissOffer() {
  if (restoring.value?.target.kind === 'offer') closeRestore();
  void editorSession.dismissOffer();
}

function onRestored(label: string) {
  const offer = restoring.value?.target.offer;
  closeRestore();
  if (offer) editorSession.clearOffer(offer);
  restoredLabel.value = label;
}

function undoRestore() {
  void editorSession.undoRestore();
}

useModalCloseGuard(() => {
  // A pasted file still on its way has nowhere to land once the editor is
  // gone; unlike the text, it is not kept anywhere.
  if (
    pendingUploads.value > 0 &&
    !window.confirm(phrase.value.content_media_pending_confirm)
  ) {
    return false;
  }
  if (!editorChangePending.value && !isDirty.value) return true;
  const confirmed = window.confirm(phrase.value.unsaved_modal_confirm);
  // The text is not simply dropped: the session keeps it as a version.
  if (confirmed) discardConfirmed = true;
  return confirmed;
});
// Everything typed reaches the browser's storage as the tab closes, so the
// browser only has to ask when that storage is not available.
useBeforeUnloadGuard(
  () => editorSession.needsUnloadGuard.value || pendingUploads.value > 0,
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
  editorLayoutQuery = window.matchMedia(EDITOR_MOBILE_LAYOUT_QUERY);
  editorLayoutQuery.addEventListener('change', applyEditorLayout);
  applyEditorLayout();

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
  // Closed before the editor even loaded: there is nothing to build it in.
  if (disposed || !holder.value) return;

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
    // Every block can be a spoiler, so the tune is registered globally rather
    // than listed on each tool.
    tunes: ['spoiler'],
    inlineToolbar: [
      'contentBold',
      'contentItalic',
      'contentStrike',
      'contentHint',
      'contentEntityLink',
      'contentExternalInlineLink',
    ],
    // What may stay in inline text is decided by each inline tool's own
    // `sanitize` and, on the way out, by `readCleanEditorOutput`; Editor.js
    // 2.31 never reads a top-level sanitizer.
    tools: {
      spoiler: {
        class: ContentSpoilerTune as unknown as ToolConstructable,
        config: {
          title: phrase.value.content_spoiler,
        } satisfies ContentSpoilerTuneConfig,
      },
      contentBold: {
        class: ContentBoldTool as unknown as InlineToolConstructable,
      },
      contentItalic: {
        // Editor.js 2.x still types constructable render() as HTMLElement even
        // though its current InlineTool API accepts MenuConfig.
        class: ContentItalicTool as unknown as InlineToolConstructable,
      },
      contentStrike: {
        class: ContentStrikeTool as unknown as InlineToolConstructable,
      },
      contentHint: {
        class: ContentHintTool as unknown as InlineToolConstructable,
        config: {
          open: (request: ContentHintRequest) =>
            hintControls.value?.open(request),
        },
      },
      contentEntityLink: {
        class: ContentEntityLinkTool as unknown as InlineToolConstructable,
        config: {
          open: (request: ContentInlineLinkRequest) =>
            inlineLinkControls.value?.openEntity(request),
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
        // A divider has nothing to hide.
        tunes: [],
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
          uploads,
          labels: contentToolLabels(),
        },
      },
      contentGallery: {
        class: ContentGalleryTool,
        inlineToolbar: true,
        config: {
          pickAssets,
          editAsset,
          uploads,
          labels: contentToolLabels(),
        },
      },
      contentAudio: {
        class: ContentAudioTool,
        inlineToolbar: false,
        config: {
          pickAsset,
          editAsset,
          uploads: audioUploads,
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
          audio: true,
        },
      },
      // Before externalLink: Editor.js hands a paste to the first tool whose
      // pattern matches, so a playable address never becomes a plain link,
      // and an address of this site becomes a link to what it opens.
      integration: {
        class: IntegrationTool,
      },
      entityLink: {
        class: entityLinkToolWithPaste(internalUrlPastePattern(internalSite)),
        config: {
          pickEntity,
          findEntityByUrl: (url: string) =>
            findEntityByInternalUrl(url, internalSite),
          resolver: contentLinkResolver,
          labels: contentToolLabels(),
          beginTransientSelection: beginTransientEntitySelection,
          endTransientSelection: endTransientEntitySelection,
        },
      },
      externalLink: {
        class: ExternalLinkTool,
        config: {
          labels: contentToolLabels(),
          links: externalLinks,
        },
      },
      privateSectionBoundary: {
        class: PrivateSectionBoundaryTool,
        inlineToolbar: false,
        // The edge of a section is not content; it cannot be a spoiler.
        tunes: [],
        toolbox: {
          title: phrase.value.content_private_section,
          icon: editorIcon('lock-close'),
          data: { edge: 'start', createPair: true },
        },
        config: {
          labels: contentToolLabels(),
        },
      },
    },
  });

  await editor.isReady;
  // Closed while the editor was starting: it has been destroyed by now, and
  // nothing may be bound to it any more.
  if (disposed) return;
  editorPrivateSections = createEditorPrivateSections(editor);
  cleanupEditorPrivatePattern = createEditorPrivatePattern(holder.value!);
  await editorSession.initialize();
  if (disposed) return;
  editorAcceptsChanges = true;
  void editorSession.loadOffers();
  cleanupEditorPopoverLayer = createEditorPopoverLayer(holder.value!);
  cleanupEditorDrag = createEditorBlockDrag(holder.value!, editor, {
    canMove: editorPrivateSections.canMove,
  });
  // One binding for the whole editor: the events bubble up from whichever
  // block is being typed in, and the rules read the caret, not the target.
  cleanupSmartTypography = bindSmartTypography(holder.value!);
  cleanupMediaPaste = bindEditorMediaPaste(holder.value!, editor, {
    audio: true,
  });
  cleanupGutterClick = bindEditorGutterClick(holder.value!, editor);
  cleanupCurrentBlock = bindEditorCurrentBlock(holder.value!, editor, {
    // The blocks whose Enter is Editor.js's own: split, before, after.
    textBlocks: new Set(['paragraph', 'header', 'list', 'quote']),
  });
  // The popups and the header live in the dialog, beside the editor.
  cleanupKeyboardBoundary = bindEditorKeyboardBoundary(
    holder.value!.closest('dialog') ?? document.body,
    holder.value!,
  );
  cleanupLinkPaste = bindEditorLinkPaste(holder.value!, editor, {
    site: internalSite,
    // The heading is plain text; captions are the media blocks' own.
    linkBlocks: new Set(['paragraph', 'list', 'quote']),
    findEntity: (url) => findEntityByInternalUrl(url, internalSite),
  });
});

onBeforeUnmount(() => {
  disposed = true;
  editorAcceptsChanges = false;
  editorLayoutQuery?.removeEventListener('change', applyEditorLayout);
  editorLayoutQuery = undefined;
  document.body.removeAttribute('data-content-editor-layout');
  void editorSession.close({
    discarded: discardConfirmed,
    replacement: discardConfirmed
      ? ((props.modalData.current?.() ?? savedValue)?.data ?? null)
      : undefined,
  });
  cleanupGutterClick?.();
  cleanupGutterClick = undefined;
  cleanupCurrentBlock?.();
  cleanupCurrentBlock = undefined;
  cleanupLinkPaste?.();
  cleanupLinkPaste = undefined;
  cleanupKeyboardBoundary?.();
  cleanupKeyboardBoundary = undefined;
  cleanupEditorPopoverLayer?.();
  cleanupEditorPopoverLayer = undefined;
  cleanupSmartTypography?.();
  cleanupSmartTypography = undefined;
  cleanupMediaPaste?.();
  cleanupMediaPaste = undefined;
  cleanupEditorDrag?.();
  cleanupEditorDrag = undefined;
  cleanupEditorPrivatePattern?.();
  cleanupEditorPrivatePattern = undefined;
  editorPrivateSections?.destroy();
  editorPrivateSections = undefined;
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
    const data = await editorSession.synchronize();
    if (contentDataIsSemanticallyEqual(data, savedValue?.data)) {
      savedKey.value = editorSession.currentKey();
      return;
    }
    const summary = summarizeContentData(
      data,
      collectContentAssetSizeMap(data),
    );
    savedKey.value = editorSession.currentKey();
    const field = editorSession.field();
    savedValue = {
      contentUuid: savedValue?.contentUuid,
      updatedAt: savedValue?.updatedAt,
      data,
      ...summary,
      // Text written before its owner exists carries the history it was
      // written under, so saving the owner hands that history over to it.
      ...(field && isNewContentOwnerRef(field.ownerRef)
        ? { draftRef: field.ownerRef }
        : {}),
    };
    headerSummary.value = summary;
    props.modalData.onSave(savedValue);
    await props.modalData.onSaved?.();
    // Saving the form lets drafts of the field go; the fields and the other
    // tabs look again.
    if (field) announceContentHistoryChange(field);
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
  const target = editor;
  // What the editor held is kept as a version before it is emptied.
  await editorSession.clear(async () => {
    await target.clear();
  });
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
    return {
      assets: result?.assets.map(mapAsset) ?? [],
      uploads: result?.uploads ?? [],
    };
  } catch (error) {
    console.error(error);
    errorMessage.value = phrase.value.content_asset_pick_error;
    return { assets: [], uploads: [] };
  }
}

/** Pasted files on their way into the library; closing the editor asks first. */
const pendingUploads = ref(0);
const uploads = pastedUploads('media');
const audioUploads = pastedUploads('audio');

function pastedUploads(kind: ContentEditorAssetKind): ContentEditorUploads {
  const options = contentAssetOptions(kind);
  return {
    constraints: {
      maxSize: options.maxSize,
      sizeLimitPolicy: options.sizeLimitPolicy,
      acceptedExtensions: acceptedExtensionsFromAccept(options.accept!),
    },
    editPending: async (pending) => {
      try {
        const edited = await launchPendingFileEditor(pending, {
          ...options,
          usageDelta: await buildDraftUsageDelta(),
        });
        return edited ? mapAsset(edited) : undefined;
      } catch (error) {
        console.error(error);
        errorMessage.value = phrase.value.content_asset_pick_error;
        return undefined;
      }
    },
    track: (delta) => {
      pendingUploads.value += delta;
    },
  };
}

function editAsset(current: ContentAssetData, kind: ContentEditorAssetKind) {
  return runModalFlow(() => runEditAsset(current, kind));
}

async function runEditAsset(
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
  if (kind === 'media')
    return {
      accept: [imageExtensionProfile, videoExtensionProfile],
      maxSize: ASSET_UPLOAD_LIMITS.media,
      sizeLimitPolicy: 'media',
    };
  // A recording may be long: an hour of WAV is over half a gigabyte, so it
  // has a file's limit. Its Opus copy, `weba`, is an audio extension too.
  if (kind === 'audio')
    return {
      accept: audioExtensionProfile,
      maxSize: ASSET_UPLOAD_LIMITS.file,
      sizeLimitPolicy: 'file',
    };
  return {
    accept: anyFileExtensionProfile,
    maxSize: ASSET_UPLOAD_LIMITS.file,
    sizeLimitPolicy: 'file',
  };
}

async function buildDraftUsageDelta() {
  if (!editor) return {};
  const draft = editorSession.current();
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

const mapAsset = contentAssetFromVariant;

function contentAssetReplaceResult(
  asset: ContentAssetData,
): AssetReplaceResult {
  return {
    assetUuid: asset.assetUuid,
    slug: asset.assetUuid,
    extension: asset.extension ?? '',
    size: asset.size ?? 0,
    media: asset.media,
    ...(asset.audio ? { audio: asset.audio } : {}),
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
    chooseAudio: phrase.value.content_choose_audio,
    audioAsFile: phrase.value.content_audio_as_file,
    audioAsPlayer: phrase.value.content_audio_as_player,
    caption: phrase.value.content_caption,
    mediaCentered: phrase.value.content_media_centered,
    mediaNatural: phrase.value.content_media_natural,
    mediaStretch: phrase.value.content_media_stretch,
    title: phrase.value.content_title,
    description: phrase.value.content_description,
    fileWithExtension: phrase.value.content_file_with_extension,
    privateSection: phrase.value.content_private_section,
    privateSectionStart: phrase.value.content_private_section_start,
    privateSectionEnd: phrase.value.content_private_section_end,
    externalLinkError: phrase.value.external_link_error,
    refreshExternalLink: phrase.value.refresh_external_link,
    linkNote: phrase.value.content_link_note_placeholder,
    chooseEntity: phrase.value.content_choose_entity,
    makeGallery: phrase.value.content_make_gallery,
    retryUpload: phrase.value.asset_upload_retry,
    cancelUpload: phrase.value.upload_cancel,
    dismissUpload: phrase.value.upload_dismiss,
  };
}

function editorJsI18nMessages() {
  const text = phrase.value.content_editor_i18n;
  return {
    ui: {
      blockTunes: {
        toggler: {
          'Click to tune': text.tune,
        },
      },
      toolbar: {
        toolbox: { Add: text.add },
      },
      popover: {
        'Convert to': text.convert_to,
      },
    },
    toolNames: {
      Text: text.text,
      Bold: text.bold,
      Italic: text.italic,
      Strikethrough: phrase.value.content_strikethrough,
      Hint: phrase.value.content_hint,
      'External link': phrase.value.content_external_link,
      'Internal link': phrase.value.content_internal_link,
      Heading: text.heading,
      List: text.list,
      Quote: text.quote,
      Delimiter: text.delimiter,
      Media: text.media,
      Gallery: text.gallery,
      Audio: text.audio,
      File: text.file,
    },
    tools: {
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
  <ModalContainer ref="modalContainer" class="max-w-200">
    <ContentInlineLinkDecorator
      playback="interaction"
      :root="holder"
      :resolver="contentLinkResolver"
    />
    <ContentInlineLinkControls
      ref="inlineLinkControls"
      :teleport-to="holder?.closest('dialog') ?? undefined"
    />
    <ContentHintControls
      ref="hintControls"
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
        <!-- Until a restore is decided, the question is the whole header. -->
        <template v-if="!restoring">
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
              <div ref="historyButton" class="flex shrink-0">
                <ModalHeaderButton
                  icon="history"
                  size="compact"
                  :label="phrase.content_history"
                  :disabled="!hasHistory"
                  :aria-expanded="historyPopupOpen"
                  aria-haspopup="dialog"
                  data-history-button
                  @click="toggleHistory"
                />
              </div>
              <ModalHeaderButton
                v-if="lastRestore"
                size="compact"
                :label="undoLabel"
                :data-title-popup="undoLabel"
                data-restore-undo
                @click="undoRestore"
              >
                <Icon name="rotate-right" class="-scale-x-100" />
              </ModalHeaderButton>
              <div
                v-if="draftOffer"
                class="flex min-w-0 shrink items-center rounded-full
                  bg-bg-warning text-xs text-text-warning"
                :data-draft-offer="offerUpdatedAt"
              >
                <button
                  type="button"
                  class="min-w-0 cursor-pointer truncate py-1 pr-1 pl-xs
                    hocus:underline"
                  :aria-label="phrase.content_draft_offer(offerTime)"
                  :data-title-popup="phrase.content_draft_offer(offerTime)"
                  data-draft-offer-open
                  @click="openOffer"
                >
                  {{ phrase.content_draft_chip(offerTime) }}
                </button>
                <button
                  type="button"
                  class="flex shrink-0 cursor-pointer items-center rounded-full
                    p-1 transition-colors hocus:bg-text-warning/15"
                  :aria-label="phrase.content_draft_dismiss"
                  :data-title-popup="phrase.content_draft_dismiss"
                  data-draft-dismiss
                  @click="dismissOffer"
                >
                  <Icon name="close" />
                </button>
              </div>
              <ContentStats v-bind="headerSummary" compact class="min-w-0" />
            </div>
            <div class="flex shrink-0 items-center gap-1 text-xs text-text-3">
              <span
                v-if="
                  historyStatus === 'offline' || historyStatus === 'refused'
                "
                class="inline-flex items-center gap-1 text-text-warning"
                :data-title-popup="historyStatusText"
                data-history-status
              >
                <Icon name="warning" />
                {{
                  historyStatus === 'offline'
                    ? phrase.content_draft_status_offline_short
                    : phrase.content_draft_status_refused_short
                }}
              </span>
              <span
                v-else-if="historyStatusText"
                class="inline-flex"
                role="img"
                :aria-label="historyStatusText"
                :data-title-popup="historyStatusText"
                data-history-status
              >
                <Icon name="cloud-upload" />
              </span>
              <TheiTime v-if="updatedAt" :datetime="updatedAt" />
              <template v-else>{{ phrase.content_never_saved }}</template>
            </div>
            <FloatingPopup
              v-model:open="historyPopupOpen"
              :anchor="historyButton"
              placement="bottom-start"
              :teleport-to="holder?.closest('dialog') ?? undefined"
              fit-content
            >
              <div class="rounded-normal border border-border-1 bg-bg-2">
                <ContentHistoryPanel
                  :session="editorSession"
                  :current="headerSummary"
                  :current-key="currentKey"
                  :opened="opened"
                  @choose="chooseVersion"
                />
              </div>
            </FloatingPopup>
          </div>
        </template>
        <ContentRestoreBar
          v-else
          :key="restoring.target.key"
          :session="editorSession"
          :target="restoring.target"
          :from-list="restoring.fromList"
          :current="headerSummary"
          :current-key="currentKey"
          :error="errorMessage"
          @preview="showDiff"
          @back="backToList"
          @close="closeRestore"
          @restored="onRestored"
        />
      </div>
    </template>

    <ContentHistoryDiff
      v-if="diff"
      :current="diff.current"
      :version="diff.version"
      :link-resolver="contentLinkResolver"
    />
    <div
      v-show="!diff"
      ref="holder"
      class="content-editor content-prose relative w-full px-sm py-md"
      @click.capture="preventEditorLinkNavigation"
      @auxclick.capture="preventEditorLinkNavigation"
    ></div>
  </ModalContainer>
</template>
