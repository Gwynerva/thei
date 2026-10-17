import { editableFieldOf } from '#layers/thei/app/components/content/editor-edit-commands';
/**
 * Ctrl+Z in the editor undoes what is safe to undo, and nothing else.
 *
 * The undo history is the browser's. It replays its own edits backwards by
 * node and offset, and knows nothing of the edits Editor.js and the blocks
 * make through the DOM: Enter splitting a paragraph, Backspace joining two,
 * a caption written anew. Once one of those has changed a field, an older
 * step of the history lands in the wrong place — it deletes words that are
 * still wanted, and redoing it writes them twice.
 *
 * So the editor's edits are counted: every step the browser records, as it
 * records them. A field changed behind the history's back is a fence: the
 * count starts again from nothing, and Ctrl+Z (or Undo from a menu) with
 * nothing counted does nothing. The count errs low — a step the browser
 * merges with the one before is never counted twice — so Ctrl+Z may stop
 * a step early, but never reaches past a fence.
 *
 * Edits made by Thei's own code in a field go through editing commands
 * (`editor-edit-commands.ts`), which the browser records like typing.
 */

/** What an `input` did, for counting the steps the browser recorded. */
export type NativeEditKind =
  'typing' | 'drag-delete' | 'drop-insert' | 'command-text' | 'other';

const TYPING_INPUTS = new Set([
  'insertText',
  'insertCompositionText',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
]);

export function nativeEditKind(
  inputType: string,
  announced: boolean,
): NativeEditKind {
  if (inputType === 'deleteByDrag') return 'drag-delete';
  if (inputType === 'insertFromDrop') return 'drop-insert';
  // An editing command's own text — a typographic replacement — may join
  // the typing before it; counted as joining, it is never counted twice.
  if (inputType === 'insertText' && !announced) return 'command-text';
  return TYPING_INPUTS.has(inputType) ? 'typing' : 'other';
}

/**
 * The count of steps the browser can safely undo and redo in the editor.
 * Pure: the binding below feeds it what the page does.
 */
export class NativeUndoLedger {
  steps = 0;
  redoable = 0;
  private run: { field: unknown; caret: number } | undefined;
  private dragging = false;

  /** A field was changed behind the history: nothing before it is safe. */
  fence() {
    this.steps = 0;
    this.redoable = 0;
    this.run = undefined;
    this.dragging = false;
  }

  /**
   * One edit the browser recorded. Typing continues the step before it while
   * the caret stays where that step left it, in the same field.
   */
  edit(
    kind: NativeEditKind,
    field: unknown,
    caret: { before: number | undefined; after: number | undefined },
  ) {
    this.redoable = 0;
    if (kind === 'drop-insert' && this.dragging) {
      // The second half of a move inside a field: one step with its delete.
      this.dragging = false;
      this.run = undefined;
      return;
    }
    this.dragging = kind === 'drag-delete';
    const continues =
      (kind === 'typing' || kind === 'command-text') &&
      this.run !== undefined &&
      this.run.field === field &&
      (kind === 'command-text' || this.run.caret === caret.before);
    if (!continues) this.steps++;
    this.run =
      (kind === 'typing' || kind === 'command-text') &&
      caret.after !== undefined
        ? { field, caret: caret.after }
        : undefined;
  }

  canUndo() {
    return this.steps > 0;
  }

  canRedo() {
    return this.redoable > 0;
  }

  undone() {
    this.steps = Math.max(0, this.steps - 1);
    this.redoable++;
    this.run = undefined;
  }

  redone() {
    this.redoable = Math.max(0, this.redoable - 1);
    this.steps++;
    this.run = undefined;
  }
}

type HistoryKey = 'undo' | 'redo';

/** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y, by the key's place, any layout. */
export function historyKey(event: KeyboardEvent): HistoryKey | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
  if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
  if (event.code === 'KeyY' && event.ctrlKey && !event.shiftKey) return 'redo';
  return undefined;
}

/**
 * Watches the editor in `root` and guards Ctrl+Z in all of `scope` — the
 * dialog — since the browser keeps one history for the whole page and an
 * undo pressed in a popup's field can take back a step of the text.
 */
export function bindEditorNativeUndo(
  root: HTMLElement,
  scope: HTMLElement = root.closest('dialog') ?? document.body,
) {
  const ledger = new NativeUndoLedger();
  /** Whether the page's latest edit was in the editor's text. */
  let lastEditInEditor = false;
  /** An undo or redo the keyboard asked for and was let through. */
  let expected: HistoryKey | undefined;
  /** The caret before the edit now under way, from its `beforeinput`. */
  let caretBefore: number | undefined;
  let announced = false;

  function fieldOf(node: Node | null) {
    const field = editableFieldOf(node);
    return field && root.contains(field) ? field : undefined;
  }

  /** A change inside a field still in the text: one the history may meet. */
  function touchesField(record: MutationRecord) {
    const field = fieldOf(record.target);
    return Boolean(field?.isConnected);
  }

  /**
   * Changes the observer reported before they were claimed: an edit of the
   * browser's may be reported halfway, before its `input`, which claims
   * them; whatever is still unclaimed at the next key, press or drop was
   * made by code.
   */
  let unclaimed: MutationRecord[] = [];

  /** Whatever changed since the last look was not the browser's editing. */
  function settle() {
    const records = [...unclaimed, ...observer.takeRecords()];
    unclaimed = [];
    if (records.some(touchesField)) ledger.fence();
  }

  function caretIn(field: HTMLElement | undefined) {
    const selection = window.getSelection();
    if (!field || !selection?.focusNode || !field.contains(selection.focusNode))
      return undefined;
    const range = document.createRange();
    range.selectNodeContents(field);
    range.setEnd(selection.focusNode, selection.focusOffset);
    return range.toString().length;
  }

  function inEditor(target: EventTarget | null) {
    return target instanceof Node && root.contains(target);
  }

  function allowed(key: HistoryKey) {
    return key === 'undo' ? ledger.canUndo() : ledger.canRedo();
  }

  function onKeyDown(event: KeyboardEvent) {
    settle();
    const key = historyKey(event);
    if (!key) return;
    if (!inEditor(event.target) && !lastEditInEditor) return;
    if (allowed(key)) {
      expected = key;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onBeforeInput(event: InputEvent) {
    settle();
    const type = event.inputType;
    if (type === 'historyUndo' || type === 'historyRedo') {
      const key: HistoryKey = type === 'historyUndo' ? 'undo' : 'redo';
      if (expected === key) return;
      if (!inEditor(event.target) && !lastEditInEditor) return;
      if (!allowed(key)) {
        event.preventDefault();
        event.stopPropagation();
      } else expected = key;
      return;
    }
    announced = true;
    caretBefore = inEditor(event.target)
      ? caretIn(fieldOf(event.target as Node))
      : undefined;
  }

  function onInput(event: Event) {
    // An `input` made up by code announces a change the history never saw;
    // it is left to fence as any other.
    if (!event.isTrusted) return;
    // What changed now is the browser's own editing, or a command's.
    observer.takeRecords();
    unclaimed = [];
    const inputType = (event as InputEvent).inputType ?? '';
    const wasAnnounced = announced;
    announced = false;
    const before = caretBefore;
    caretBefore = undefined;
    if (!inEditor(event.target)) {
      if (inputType !== 'historyUndo' && inputType !== 'historyRedo')
        lastEditInEditor = false;
      expected = undefined;
      return;
    }
    lastEditInEditor = true;
    if (inputType === 'historyUndo') ledger.undone();
    else if (inputType === 'historyRedo') ledger.redone();
    else {
      const field = fieldOf(event.target as Node);
      ledger.edit(nativeEditKind(inputType, wasAnnounced), field, {
        before,
        after: caretIn(field),
      });
    }
    expected = undefined;
  }

  const observer = new MutationObserver((records) => {
    unclaimed.push(...records);
  });
  observer.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  const settleOnly = () => settle();
  scope.addEventListener('keydown', onKeyDown, true);
  scope.addEventListener('beforeinput', onBeforeInput, true);
  scope.addEventListener('input', onInput, true);
  scope.addEventListener('pointerdown', settleOnly, true);
  scope.addEventListener('paste', settleOnly, true);
  scope.addEventListener('drop', settleOnly, true);
  return () => {
    observer.disconnect();
    scope.removeEventListener('keydown', onKeyDown, true);
    scope.removeEventListener('beforeinput', onBeforeInput, true);
    scope.removeEventListener('input', onInput, true);
    scope.removeEventListener('pointerdown', settleOnly, true);
    scope.removeEventListener('paste', settleOnly, true);
    scope.removeEventListener('drop', settleOnly, true);
  };
}
