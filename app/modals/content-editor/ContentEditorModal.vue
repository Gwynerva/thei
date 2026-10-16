<script lang="ts" setup>
import type EditorJS from '@editorjs/editorjs';
import type { VirtualElement } from '@floating-ui/vue';
import type {
  API,
  BlockAPI,
  BlockMutationEvent,
  EditorConfig,
  InlineToolConstructable,
  OutputData,
  ToolConstructable,
} from '@editorjs/editorjs';
import type { AssetReplaceResult } from '#layers/thei/shared/api/asset';
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
import type {
  ContentLinkPick,
  ContentLinkTarget,
} from '#layers/thei/app/components/content/link-picker/types';
import {
  ContentAttachmentTool,
  ContentAudioTool,
  ContentBoldTool,
  ContentHintTool,
  ContentStrikeTool,
  ContentGalleryTool,
  ContentItalicTool,
  ContentLinkTool,
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
import {
  bindEditorBlockToolbox,
  editorToolboxEntries,
  insertToolboxBlock,
  orderToolboxEntries,
  storeToolboxOrder,
  storedToolboxOrder,
  type EditorToolboxEntry,
} from '#layers/thei/app/composables/editor-block-toolbox';
import ContentBlockToolbox from '#layers/thei/app/components/content/ContentBlockToolbox.vue';
import {
  editableFieldOf,
  selectRange,
} from '#layers/thei/app/components/content/editor-edit-commands';
import { bindEditorGutterClick } from '#layers/thei/app/composables/editor-gutter-click';
import { bindEditorCurrentBlock } from '#layers/thei/app/composables/editor-current-block';
import { bindEditorLinkPaste } from '#layers/thei/app/composables/editor-link-paste';
import { bindEditorAtLink } from '#layers/thei/app/composables/editor-at-link';
import { bindEditorInlineBoundary } from '#layers/thei/app/composables/editor-inline-boundary';
import { bindEditorTextDrop } from '#layers/thei/app/composables/editor-text-drop';
import { bindEditorTextPaste } from '#layers/thei/app/composables/editor-text-paste';
import { bindEditorNativeUndo } from '#layers/thei/app/composables/editor-native-undo';
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
  type ContentHistoryStoredResponse,
} from '#layers/thei/shared/content-history';
import ContentHistoryPanel from '#layers/thei/app/components/content/ContentHistoryPanel.vue';
import {
  offerRestoreTarget,
  type RestoreTarget,
} from '#layers/thei/app/composables/content-history/restore-target';
import {
  historyTime,
  useHistoryTimeLabels,
} from '#layers/thei/app/composables/content-history/time-labels';
import type { AiActionItem, AiTextReviews } from '#layers/thei/shared/ai';
import {
  versionReview,
  type ContentReview as ContentReviewModel,
  type ReviewDecision,
} from '#layers/thei/shared/content-review';
import { partComment, storedDecisions, textEditReview } from './review/review';
import { registerDismissLayer } from '#layers/thei/app/composables/modal';
import ContentReview from './review/ContentReview.vue';
import ContentEditorNotices from './ContentEditorNotices.vue';

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
    /**
     * An AI's edit of this text to go through at once: the editor opens on
     * its review, from the proposal under the field.
     */
    review?: string;
    /**
     * The AI's edits taken here, handed to the form with the text: the form
     * tells their sessions once it is saved, and only then.
     */
    onTaken?: (taken: Record<string, Record<string, ReviewDecision>>) => void;
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
let cleanupAtLink: (() => void) | undefined;
let cleanupInlineBoundary: (() => void) | undefined;
let cleanupKeyboardBoundary: (() => void) | undefined;
let cleanupTextDrop: (() => void) | undefined;
let cleanupTextPaste: (() => void) | undefined;
let cleanupNativeUndo: (() => void) | undefined;
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
/** The grid of blocks the "+" opens, and the block it opened beside. */
const toolboxOpen = ref(false);
const toolboxAnchor = shallowRef<VirtualElement>();
const toolboxEntries = shallowRef<EditorToolboxEntry[]>([]);
const toolboxOrder = ref(storedToolboxOrder());
const orderedToolbox = computed(() =>
  orderToolboxEntries(toolboxEntries.value, toolboxOrder.value),
);
const toolbox = useTemplateRef<{ focus: () => void }>('toolbox');
let toolboxBlock: BlockAPI | undefined;
let blockToolbox: ReturnType<typeof bindEditorBlockToolbox> | undefined;

const linkPickerOpen = ref(false);
const linkPicker = useTemplateRef<{ focus: () => void }>('linkPicker');
const linkPickerAnchor = ref<HTMLElement>();
const linkPickerInitial = shallowRef<ContentLinkTarget>();
/** Each opening is a picker of its own, fresh. */
const linkPickerOpening = ref(0);
let linkPickerResolve: ((pick?: ContentLinkPick) => void) | undefined;
const saving = ref(false);
const errorMessage = ref<string | undefined>();
const historyPopupOpen = ref(false);
/** The history's button itself, which its popup points at and marks open. */
const historyTrigger = useTemplateRef<{ $el: HTMLElement }>('historyTrigger');
const historyButton = computed(() => historyTrigger.value?.$el ?? null);
const restoredLabel = ref('');
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
/**
 * The text shows once the editor takes input as it should. Editor.js shows
 * its blocks before it binds their keys, at the first idle moment, and the
 * paste, undo and typing handlers are bound after that: words pasted or
 * typed sooner would go in behind their back, uncleaned and past Ctrl+Z.
 */
const editorReady = ref(false);
let editorAcceptsChanges = false;
let transientEntitySelections = 0;
let cleanupEditorDrag: (() => void) | undefined;
let cleanupEditorPopoverLayer: (() => void) | undefined;
let cleanupEditorPrivatePattern: (() => void) | undefined;
let editorPrivateSections:
  ReturnType<typeof createEditorPrivateSections> | undefined;

/** Where the caret was in the block when the grid opened over it. */
let toolboxCaret: Range | undefined;

function openToolbox(anchor: VirtualElement, block: BlockAPI) {
  toolboxBlock = block;
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  toolboxCaret =
    range && block.holder.contains(range.startContainer)
      ? range.cloneRange()
      : undefined;
  toolboxAnchor.value = anchor;
  toolboxOpen.value = true;
}

async function toolboxPicked(entry: EditorToolboxEntry) {
  const block = toolboxBlock;
  toolboxOpen.value = false;
  if (editor && block) await insertToolboxBlock(editor, block, entry);
}

/**
 * Escaped: the caret goes back where it was, or into the block the grid
 * opened beside. Closed by a tap or a click elsewhere, the focus goes there.
 */
function toolboxDismissed(reason: 'outside' | 'escape') {
  const block = toolboxBlock;
  if (reason !== 'escape' || !editor || !block) return;
  const caret = toolboxCaret;
  const field = caret && editableFieldOf(caret.startContainer);
  if (caret && field?.isConnected) {
    field.focus({ preventScroll: true });
    selectRange(caret);
  } else if (editor.blocks.getById(block.id))
    editor.caret.setToBlock(block, 'end');
}

function toolboxReordered(keys: string[]) {
  toolboxOrder.value = keys;
  storeToolboxOrder(keys);
}

/** The link picker beside a link block, on where it leads now. */
function pickLink(anchor: HTMLElement, initial?: ContentLinkTarget) {
  linkPickerResolve?.();
  linkPickerAnchor.value = anchor;
  linkPickerInitial.value = initial;
  linkPickerOpening.value++;
  linkPickerOpen.value = true;
  return new Promise<ContentLinkPick | undefined>((resolve) => {
    linkPickerResolve = resolve;
  });
}

function linkPicked(pick: ContentLinkPick) {
  const resolve = linkPickerResolve;
  linkPickerResolve = undefined;
  linkPickerOpen.value = false;
  resolve?.(pick);
}

function closeLinkPicker() {
  // Opened again while it faded: the new opening waits for its own choice.
  if (linkPickerOpen.value) return;
  const resolve = linkPickerResolve;
  linkPickerResolve = undefined;
  linkPickerAnchor.value = undefined;
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
    ? `${phrase.value.content_restore_undo} · ${phrase.value.content_taken_from(restoredLabel.value)}`
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
    // A choice kept is a change, said here: Editor.js tells its changes in
    // batches, and one that comes while another block waits for its choice
    // is passed over whole.
    if (editorAcceptsChanges) editorSession.recordChange();
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
  historyPopupOpen.value = !historyPopupOpen.value;
}

// ---- Going through another version, or an AI's edit -------------------------------

/**
 * A change gone through over the editor's text, on the review screen in its
 * place: another version of the text — a draft, a version from the history —
 * or an AI's edit of it. What is taken lands in the editor as one change,
 * undone at a click, and is kept as any change is: once the form is saved.
 */
type Review =
  | {
      kind: 'version';
      target: RestoreTarget;
      model: ContentReviewModel;
      title: string;
      why: string;
    }
  | { kind: 'ai'; action: AiActionItem; model: ContentReviewModel };
const review = shallowRef<Review>();
const reviewBusy = ref(false);
const reviewError = ref('');
let removeReviewLayer: (() => void) | undefined;
const { time: versionTime, dayLabel } = useHistoryTimeLabels();

function openReview(next: Review) {
  historyPopupOpen.value = false;
  reviewError.value = '';
  review.value = next;
  // Escape and Back leave the review before they close the editor.
  removeReviewLayer?.();
  removeReviewLayer = registerDismissLayer(() => closeReview());
}

function closeReview() {
  removeReviewLayer?.();
  removeReviewLayer = undefined;
  review.value = undefined;
}

/** What a version is called on its screen: its day and time, or its kind. */
function versionLabel(target: RestoreTarget) {
  if (target.kind === 'opened')
    return phrase.value.content_history_opened_version;
  if (!target.time) return '';
  if (target.kind === 'offer')
    return phrase.value.content_draft_notice(historyTime(target.time));
  if (target.kind === 'stored')
    return phrase.value.content_stored_notice(historyTime(target.time));
  return `${dayLabel(target.time)}, ${versionTime(target.time)}`;
}

async function compareWith(target: RestoreTarget) {
  historyPopupOpen.value = false;
  errorMessage.value = undefined;
  try {
    const { data, missingAssets } = await target.load();
    // Over the text as it is this moment: the last words typed included.
    const now = await editorSession.synchronize();
    if (disposed) return;
    const model = versionReview(now, data, {
      formatText: publicText,
    });
    if (!model.parts.length) {
      showToast(phrase.value.content_restore_same);
      return;
    }
    const reason =
      target.kind === 'revision' && target.reason
        ? `${phrase.value.content_history_reasons[target.reason]}. `
        : '';
    openReview({
      kind: 'version',
      target,
      model,
      title: phrase.value.ai_review_compare_title(versionLabel(target)),
      why: `${reason}${phrase.value.ai_review_compare_why}${
        missingAssets
          ? ` ${phrase.value.content_history_missing_assets(missingAssets)}.`
          : ''
      }`,
    });
  } catch {
    errorMessage.value = phrase.value.content_history_load_error;
  }
}

// The text may be saved elsewhere — another device, another tab — while
// this one is written in; it is offered to compare, as a draft is.
const seenStoredAt = ref(
  props.modalData.current?.()?.updatedAt ??
    props.modalData.value?.updatedAt ??
    0,
);
const storedElsewhere = computed(() => {
  const stored = editorSession.stored.value;
  if (!stored || stored.updatedAt <= seenStoredAt.value) return undefined;
  if ((props.modalData.current?.()?.updatedAt ?? 0) >= stored.updatedAt)
    return undefined;
  if (stored.key === currentKey.value || stored.key === savedKey.value)
    return undefined;
  return stored;
});

function compareStored() {
  const stored = storedElsewhere.value;
  const field = editorSession.field();
  if (!stored || !field) return;
  void compareWith({
    kind: 'stored',
    time: stored.updatedAt,
    load: async () => {
      const { data } = await $fetch<ContentHistoryStoredResponse>(
        '/api/admin/content-history/stored',
        { query: field },
      );
      return { data, missingAssets: 0 };
    },
  });
}

function dismissStored() {
  seenStoredAt.value = storedElsewhere.value?.updatedAt ?? seenStoredAt.value;
}

function chooseVersion(target: RestoreTarget) {
  void compareWith(target);
}

function openOffer() {
  if (!draftOffer.value) return;
  void compareWith(offerRestoreTarget(draftOffer.value, editorSession));
}

function dismissOffer() {
  void editorSession.dismissOffer();
}

function undoRestore() {
  // An edit taken and put back waits again, in its session and here.
  if (lastTaken) {
    takenHere.delete(lastTaken);
    const again = new Set(reviewedHere.value);
    again.delete(lastTaken);
    reviewedHere.value = again;
    lastTaken = undefined;
  }
  void editorSession.undoRestore();
}

// An AI's edits of this text wait in its sessions; the editor offers them.
const aiEnabled = useAiEnabled();
const aiReviews = shallowRef<AiActionItem[]>([]);
/** Edits gone through in this editor: they wait for the form to be saved. */
const reviewedHere = ref(new Set<string>());
const waitingReviews = computed(() =>
  aiReviews.value.filter(
    (action) => !reviewedHere.value.has(action.actionUuid),
  ),
);
/**
 * The owner's word on each edit taken here, told to its session once the
 * form is saved with it — or let go if the change is undone first.
 */
const takenHere = new Map<string, Record<string, ReviewDecision>>();
let lastTaken: string | undefined;

async function loadAiReviews() {
  const field = props.modalData.history?.field;
  if (!aiEnabled.value || !field || isNewContentOwnerRef(field.ownerRef))
    return;
  try {
    const { actions } = await $fetch<AiTextReviews>(
      '/api/admin/ai/texts/reviews',
      {
        query: {
          ownerType: field.ownerType,
          ownerId: field.ownerRef,
          slot: field.slot,
        },
      },
    );
    aiReviews.value = actions;
  } catch {
    aiReviews.value = [];
  }
}

/** Over the text as it is this moment: the last words typed included. */
async function openAiReview(action: AiActionItem) {
  const data = await editorSession.synchronize();
  if (disposed) return;
  openReview({ kind: 'ai', action, model: textEditReview(action, data) });
}

/**
 * Written back to the form: what was taken here goes with the text, for the
 * form to tell once it is saved. Saved, a take is no longer undone here.
 */
function handTaken() {
  if (takenHere.size) props.modalData.onTaken?.(Object.fromEntries(takenHere));
  takenHere.clear();
  lastTaken = undefined;
  editorSession.forgetRestore();
}

const reviewInitial = computed(() => {
  const current = review.value;
  return current?.kind === 'ai' ? storedDecisions(current.action) : undefined;
});

/** The owner's «as it was» is final: the session hears of it at once. */
function keepParts(
  action: AiActionItem,
  decisions: Record<string, ReviewDecision>,
) {
  const kept = Object.fromEntries(
    Object.entries(decisions).filter(([, decision]) => decision === 'kept'),
  );
  if (Object.keys(kept).length)
    void aiApi.decideParts(action.actionUuid, kept).catch(() => undefined);
}

async function reviewDone(decisions: Record<string, ReviewDecision>) {
  const current = review.value;
  if (!current || reviewBusy.value) return;
  reviewBusy.value = true;
  reviewError.value = '';
  const taken = Object.values(decisions).filter(
    (decision) => decision === 'accepted',
  ).length;
  try {
    const result = current.model.result(decisions);
    const restored = await editorSession.restore(
      result,
      current.kind === 'version' && current.target.adoptRef
        ? { adoptRef: current.target.adoptRef }
        : {},
    );
    if (!restored) {
      reviewError.value = phrase.value.content_editor_save_error;
      return;
    }
    lastTaken = undefined;
    if (current.kind === 'version') {
      if (current.target.offer) editorSession.clearOffer(current.target.offer);
      if (current.target.kind === 'stored' && current.target.time)
        seenStoredAt.value = current.target.time;
      restoredLabel.value = versionLabel(current.target);
      showToast(phrase.value.ai_review_taken(taken), undoToast());
    } else {
      keepParts(current.action, decisions);
      takenHere.set(current.action.actionUuid, decisions);
      lastTaken = current.action.actionUuid;
      reviewedHere.value = new Set(reviewedHere.value).add(
        current.action.actionUuid,
      );
      restoredLabel.value = phrase.value.ai_review_title;
      showToast(phrase.value.ai_review_applied(taken), undoToast());
    }
    closeReview();
  } finally {
    reviewBusy.value = false;
  }
}

/** What was just taken can be put back at once, from its word too. */
function undoToast() {
  return { label: phrase.value.ai_action_undo, run: undoRestore };
}

function reviewClosed(decisions: Record<string, ReviewDecision>) {
  const current = review.value;
  if (current?.kind === 'ai') keepParts(current.action, decisions);
  closeReview();
}

function reviewComment(partId: string, words: string) {
  const current = review.value;
  if (current?.kind !== 'ai') return;
  void aiApi
    .comment(
      current.action.actionUuid,
      partComment(current.model, partId, words),
    )
    .catch(() => showToast(phrase.value.ai_error));
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

/** The AI's edits of this text, once read. */
let reviewsRead: Promise<void> = Promise.resolve();

/** The editor opened for one edit: its review comes up once both are ready. */
async function openAskedReview(actionUuid: string) {
  await reviewsRead;
  const action = aiReviews.value.find((item) => item.actionUuid === actionUuid);
  if (action && !disposed && !review.value) void openAiReview(action);
}

async function startEditor() {
  reviewsRead = loadAiReviews();
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

  // Bound before the editor, so its listeners stand in front of Editor.js's
  // own drop handling on the same holder.
  cleanupTextDrop = bindEditorTextDrop(holder.value!, {
    closeInlineToolbar: () => editor?.inlineToolbar.close(),
  });
  const tools: EditorConfig['tools'] = {
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
    contentLink: {
      class: ContentLinkTool as unknown as InlineToolConstructable,
      config: {
        open: (request: ContentInlineLinkRequest) =>
          inlineLinkControls.value?.open(request),
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
        pickLink,
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
        pickLink,
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
  };
  toolboxEntries.value = editorToolboxEntries(
    tools as Record<string, unknown>,
    (title) =>
      (editorJsI18nMessages().toolNames as Record<string, string>)[title] ??
      title,
  );
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
      'contentLink',
    ],
    // What may stay in inline text is decided by each inline tool's own
    // `sanitize` and, on the way out, by `readCleanEditorOutput`; Editor.js
    // 2.31 never reads a top-level sanitizer.
    tools,
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
  if (props.modalData.review) void openAskedReview(props.modalData.review);
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
  blockToolbox = bindEditorBlockToolbox(holder.value!, editor, {
    open: openToolbox,
  });
  blockToolbox.hint({
    add: phrase.value.content_block_add,
    settings: phrase.value.content_block_settings,
  });
  cleanupCurrentBlock = bindEditorCurrentBlock(holder.value!, editor, {
    // The blocks whose Enter is Editor.js's own: split, before, after.
    textBlocks: new Set(['paragraph', 'header', 'list', 'quote']),
  });
  // The popups and the header live in the dialog, beside the editor.
  cleanupKeyboardBoundary = bindEditorKeyboardBoundary(
    holder.value!.closest('dialog') ?? document.body,
    holder.value!,
  );
  // The heading is plain text; captions are the media blocks' own.
  const linkBlocks = new Set(['paragraph', 'list', 'quote']);
  cleanupLinkPaste = bindEditorLinkPaste(holder.value!, editor, {
    site: internalSite,
    linkBlocks,
    findEntity: (url) => findEntityByInternalUrl(url, internalSite),
  });
  cleanupAtLink = bindEditorAtLink(holder.value!, editor, {
    linkBlocks,
    open: (request) => inlineLinkControls.value?.open(request),
  });
  cleanupInlineBoundary = bindEditorInlineBoundary(holder.value!);
  // After the media and link pastes, which claim theirs first.
  cleanupTextPaste = bindEditorTextPaste(holder.value!);
  cleanupNativeUndo = bindEditorNativeUndo(
    holder.value!,
    holder.value!.closest('dialog') ?? document.body,
  );
}

// Shown as well when starting failed halfway, so the text is still there.
onMounted(() => startEditor().finally(() => (editorReady.value = true)));

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
  cleanupAtLink?.();
  cleanupAtLink = undefined;
  cleanupInlineBoundary?.();
  cleanupInlineBoundary = undefined;
  cleanupTextDrop?.();
  cleanupTextDrop = undefined;
  cleanupTextPaste?.();
  cleanupTextPaste = undefined;
  cleanupNativeUndo?.();
  cleanupNativeUndo = undefined;
  blockToolbox?.destroy();
  blockToolbox = undefined;
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
    handTaken();
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
  historyPopupOpen.value = false;
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
    // The editor opens at once and fetches the file itself.
    const edited = await launchAssetEditor(current.assetUuid, {
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
    changeLink: phrase.value.content_link_change,
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
      Link: phrase.value.content_link,
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
  <!-- One root: the host hides it while another modal is on top. -->
  <div class="contents">
    <ModalContainer v-show="!review" ref="modalContainer" class="max-w-200">
      <ContentInlineLinkDecorator
        playback="interaction"
        :root="holder"
        :resolver="contentLinkResolver"
      />
      <ContentInlineLinkControls ref="inlineLinkControls" />
      <ContentHintControls ref="hintControls" />
      <FloatingPopup
        v-model:open="toolboxOpen"
        :anchor="toolboxAnchor ?? null"
        placement="bottom-start"
        :fallback-placements="['top-start']"
        fit-content
        density="compact"
        @opened="toolbox?.focus()"
        @dismiss="toolboxDismissed"
      >
        <ContentBlockToolbox
          ref="toolbox"
          :entries="orderedToolbox"
          @pick="toolboxPicked"
          @reorder="toolboxReordered"
        />
      </FloatingPopup>
      <FloatingPopup
        v-model:open="linkPickerOpen"
        :anchor="linkPickerAnchor ?? null"
        placement="bottom-start"
        complex
        @opened="linkPicker?.focus()"
        @closed="closeLinkPicker"
      >
        <ContentLinkPicker
          ref="linkPicker"
          :key="linkPickerOpening"
          mode="block"
          :initial="linkPickerInitial"
          @apply="linkPicked"
        />
      </FloatingPopup>
      <template #header>
        <!-- One slim row: what is edited and whether it is kept, its history,
           close and save. What waits for the owner opens the text instead. -->
        <div class="flex min-w-0 items-center gap-xs p-sm">
          <ModalTitle
            icon="edit"
            :title="modalData.title || phrase.content_editor_title"
            class="min-w-0 flex-1"
          />
          <span
            v-if="historyStatus === 'offline' || historyStatus === 'refused'"
            class="inline-flex shrink-0 text-text-warning"
            role="img"
            :aria-label="historyStatusText"
            :data-title-popup="historyStatusText"
            data-history-status
            ><Icon name="warning"
          /></span>
          <span
            v-else-if="historyStatusText"
            class="inline-flex shrink-0 text-text-3"
            role="img"
            :aria-label="historyStatusText"
            :data-title-popup="historyStatusText"
            data-history-status
            ><Icon name="cloud-upload"
          /></span>
          <div
            v-if="errorMessage"
            class="min-w-0 truncate text-sm text-text-error"
          >
            {{ errorMessage }}
          </div>
          <ModalHeaderButton
            v-if="lastRestore"
            :label="undoLabel"
            :data-title-popup="undoLabel"
            data-restore-undo
            @click="undoRestore"
          >
            <Icon name="rotate-right" class="-scale-x-100" />
          </ModalHeaderButton>
          <div class="relative flex shrink-0">
            <ModalHeaderButton
              ref="historyTrigger"
              icon="history"
              :label="phrase.content_history"
              :disabled="!hasHistory"
              :aria-expanded="historyPopupOpen"
              aria-haspopup="dialog"
              data-history-button
              @click="toggleHistory"
            />
            <span
              v-if="draftOffer"
              class="pointer-events-none absolute top-1 right-1 size-2
                rounded-full bg-text-warning ring-2 ring-bg-2"
              aria-hidden="true"
            ></span>
          </div>
          <ModalHeaderButton
            icon="close"
            :label="phrase.close_modal"
            @click="closeModal"
          />
          <ModalHeaderButton
            variant="accent"
            :label="phrase.save"
            :disabled="saving || !isDirty"
            data-editor-save
            @click="save"
          >
            <Icon v-if="saving" name="loading" />
            {{ isDirty ? phrase.save : phrase.saved }}
          </ModalHeaderButton>
        </div>
        <FloatingPopup
          v-model:open="historyPopupOpen"
          :anchor="historyButton"
          placement="bottom-end"
          fit-content
          complex
        >
          <div>
            <ContentHistoryPanel
              :session="editorSession"
              :current="headerSummary"
              :current-key="currentKey"
              :opened="opened"
              :clearable="headerSummary.blockCount > 0"
              @choose="chooseVersion"
              @clear="clearContent"
            />
          </div>
        </FloatingPopup>
      </template>

      <div class="px-sm pt-md empty:hidden">
        <ContentEditorNotices
          :status="
            historyStatus === 'offline' || historyStatus === 'refused'
              ? historyStatus
              : undefined
          "
          :offer-time="draftOffer ? offerTime : undefined"
          :offer-at="offerUpdatedAt"
          :stored-time="
            storedElsewhere ? historyTime(storedElsewhere.updatedAt) : undefined
          "
          @compare-stored="compareStored"
          @dismiss-stored="dismissStored"
          :reviews="waitingReviews"
          @compare-offer="openOffer"
          @dismiss-offer="dismissOffer"
          @open-review="openAiReview"
        />
      </div>
      <div
        ref="holder"
        class="content-editor content-prose relative w-full px-sm py-md"
        :class="{ invisible: !editorReady }"
        @click.capture="preventEditorLinkNavigation"
        @auxclick.capture="preventEditorLinkNavigation"
      ></div>
      <!-- What the text holds, and when it was last kept. -->
      <div
        class="mx-sm mb-md flex flex-wrap items-center gap-x-3.5 gap-y-1
          border-t border-border-1 pt-sm text-xs text-text-2"
        data-editor-foot
      >
        <ContentStats v-bind="headerSummary" compact class="min-w-0" />
        <span class="inline-flex items-center gap-1 text-text-3">
          <TheiTime v-if="updatedAt" :datetime="updatedAt" />
          <template v-else>{{ phrase.content_never_saved }}</template>
        </span>
      </div>
    </ModalContainer>

    <ContentReview
      v-if="review"
      :review="review.model"
      :mode="review.kind"
      :title="review.kind === 'version' ? review.title : phrase.ai_review_title"
      :context="modalData.title || phrase.content_editor_title"
      :why="
        review.kind === 'version'
          ? review.why
          : review.action.reason
            ? publicText(review.action.reason)
            : undefined
      "
      :initial="reviewInitial"
      target="editor"
      :busy="reviewBusy"
      :error="reviewError"
      :commentable="review.kind === 'ai'"
      :link-resolver="contentLinkResolver"
      @close="reviewClosed"
      @done="reviewDone"
      @comment="reviewComment"
    />
  </div>
</template>
