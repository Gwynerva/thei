import {
  onBeforeUnmount,
  onMounted,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';
import {
  editCommandRunning,
  runEditCommand,
  selectRange,
  TYPED_BY_COMMAND,
} from '#layers/thei/app/components/content/editor-edit-commands';

/**
 * Typing shorthands that turn into real typography as they are typed.
 *
 * Two halves, kept apart on purpose: a pure core that decides what a piece of
 * text just before the caret should become, and a DOM binder that applies the
 * decision to an input, a textarea or a contenteditable.
 *
 * Every replacement can be taken back. Pressing backspace right after one
 * restores exactly what was typed instead of eating a character — the person
 * meant two hyphens, and the editor does not get to insist otherwise.
 *
 * Only typing is replaced, never a paste, and the replacement is an editing
 * command, so the browser's Ctrl+Z steps through it like any other edit.
 */
export interface SmartTypographyRule {
  /**
   * Matched against the text before the caret, so it must be anchored with
   * `$`. The whole match is replaced.
   */
  pattern: RegExp;
  /** Replacement, with the usual `$1` group references. */
  replacement: string;
}

export const SMART_TYPOGRAPHY_RULES: readonly SmartTypographyRule[] = [
  // Three dots are always an ellipsis; nothing else is written that way.
  { pattern: /\.\.\.$/, replacement: '…' },
  // Two hyphens are a dash only where a dash could stand: between words with
  // a space in front. Glued hyphens belong to a compound or a command line.
  { pattern: /(^|[\s(«“])--$/, replacement: '$1—' },
];

export interface SmartTypographyEdit {
  /** Where the replaced text starts, as an offset into the text. */
  start: number;
  /** What the person typed. */
  original: string;
  /** What it became. */
  replacement: string;
}

/**
 * Decides what the text ending at the caret should become, or nothing at all.
 * `before` is the text from the start of the field up to the caret.
 */
export function smartTypographyEdit(
  before: string,
  rules: readonly SmartTypographyRule[] = SMART_TYPOGRAPHY_RULES,
): SmartTypographyEdit | undefined {
  for (const rule of rules) {
    const match = rule.pattern.exec(before);
    if (!match) continue;
    const original = match[0];
    const replacement = original.replace(rule.pattern, rule.replacement);
    if (replacement === original) continue;
    return { start: before.length - original.length, original, replacement };
  }
  return undefined;
}

/** What one field remembers so the last replacement can be undone. */
interface PendingUndo {
  start: number;
  original: string;
  replacement: string;
}

type TypographyTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/**
 * An input or a textarea, recognised by what the binder needs from it rather
 * than by its constructor: `instanceof` is answered by the realm the class
 * came from, and a field rendered in another document would fail it while
 * behaving exactly the same.
 */
function isFieldElement(
  element: TypographyTarget,
): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    typeof (element as HTMLInputElement).setSelectionRange === 'function' &&
    typeof (element as HTMLInputElement).value === 'string'
  );
}

/**
 * Binds the rules to one element. Returns a teardown function.
 *
 * The caller owns the element, so nothing here assumes a Vue lifecycle: the
 * editor binds whole blocks, a field binds itself.
 */
export function bindSmartTypography(
  element: TypographyTarget,
  rules: readonly SmartTypographyRule[] = SMART_TYPOGRAPHY_RULES,
): () => void {
  let pending: PendingUndo | undefined;

  function onBeforeInput(event: Event) {
    const input = event as InputEvent;
    if (input.defaultPrevented) {
      pending = undefined;
      return;
    }
    if (input.inputType !== 'deleteContentBackward') {
      // Anything else — typing, pasting, a forward delete — ends the window in
      // which the last replacement can be taken back.
      if (input.inputType !== 'insertText') pending = undefined;
      return;
    }
    if (!pending) return;
    if (undoReplacement(element, pending)) {
      input.preventDefault();
      pending = undefined;
    } else pending = undefined;
  }

  function onInput(event: Event) {
    // The replacement announces itself with an `input` event so `v-model` and
    // Editor.js see an ordinary edit. That announcement must not be mistaken
    // for someone typing, or it would immediately forget the replacement it
    // was announcing and there would be nothing left to take back.
    if (announcing) return;
    // Nor is a command of Thei's — a paste written in, a word put back into
    // its markup — typing: what it types, it tells by itself.
    if (editCommandRunning()) return;
    const input = event as InputEvent;
    if (input.inputType !== 'insertText') {
      if (!input.inputType?.startsWith('insert')) pending = undefined;
      return;
    }
    pending = applyReplacement(element, rules);
  }

  // Many phone keyboards compose every word: the rules run once a word is
  // composed, never inside a composition, which they would break.
  // Letters an editor's rule wrote in place of the browser's typing — at the
  // edge of a link, say — are typed all the same.
  function onTypedByCommand() {
    pending = applyReplacement(element, rules);
  }

  function onCompositionEnd() {
    pending = applyReplacement(element, rules);
  }

  function onSelectionChange() {
    pending = undefined;
  }

  // Ahead of the editor's own rules for the same keys: Backspace right after
  // a replacement takes it back before anything else is made of it.
  element.addEventListener('beforeinput', onBeforeInput, true);
  element.addEventListener('input', onInput);
  element.addEventListener(TYPED_BY_COMMAND, onTypedByCommand);
  element.addEventListener('compositionend', onCompositionEnd);
  element.addEventListener('focusout', onSelectionChange);
  element.addEventListener('pointerdown', onSelectionChange);

  return () => {
    element.removeEventListener('beforeinput', onBeforeInput, true);
    element.removeEventListener('input', onInput);
    element.removeEventListener(TYPED_BY_COMMAND, onTypedByCommand);
    element.removeEventListener('compositionend', onCompositionEnd);
    element.removeEventListener('focusout', onSelectionChange);
    element.removeEventListener('pointerdown', onSelectionChange);
  };
}

function applyReplacement(
  element: TypographyTarget,
  rules: readonly SmartTypographyRule[],
): PendingUndo | undefined {
  if (isFieldElement(element)) {
    const caret = element.selectionStart;
    if (caret === null || caret !== element.selectionEnd) return undefined;
    const edit = smartTypographyEdit(element.value.slice(0, caret), rules);
    if (!edit) return undefined;
    replaceInField(element, edit.start, caret, edit.replacement);
    return edit;
  }

  const point = caretTextNode();
  if (!point) return undefined;
  const { node, offset } = point;
  const edit = smartTypographyEdit((node.data ?? '').slice(0, offset), rules);
  if (!edit) return undefined;
  replaceInText(element, node, edit.start, offset, edit.replacement);
  return edit;
}

function undoReplacement(
  element: TypographyTarget,
  pending: PendingUndo,
): boolean {
  if (isFieldElement(element)) {
    const caret = element.selectionStart;
    const end = pending.start + pending.replacement.length;
    if (caret === null || caret !== element.selectionEnd || caret !== end)
      return false;
    if (element.value.slice(pending.start, end) !== pending.replacement)
      return false;
    replaceInField(element, pending.start, end, pending.original);
    return true;
  }

  const point = caretTextNode();
  if (!point) return false;
  const { node, offset } = point;
  const end = pending.start + pending.replacement.length;
  if (offset !== end) return false;
  if ((node.data ?? '').slice(pending.start, end) !== pending.replacement)
    return false;
  replaceInText(element, node, pending.start, end, pending.original);
  return true;
}

/**
 * Replaces part of an input's or a textarea's value as an editing command,
 * which keeps the field's own undo history; a browser that refuses gets the
 * value written.
 */
function replaceInField(
  element: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
) {
  element.setSelectionRange(start, end);
  if (
    typeof document !== 'undefined' &&
    document.activeElement === element &&
    announced(() => runEditCommand('insertText', text))
  )
    return;
  const next = element.value.slice(0, start) + text + element.value.slice(end);
  setFieldValue(element, next, start + text.length);
}

/** The same in editable text: one editing command, else the text node. */
function replaceInText(
  element: TypographyTarget,
  node: Text,
  start: number,
  end: number,
  text: string,
) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  if (selectRange(range) && announced(() => runEditCommand('insertText', text)))
    return;
  node.replaceData(start, end - start, text);
  placeCaret(node, start + text.length);
  notifyInput(element);
}

/** Runs a command whose own `input` event is not someone typing. */
function announced(command: () => boolean) {
  announcing = true;
  try {
    return command();
  } finally {
    announcing = false;
  }
}

/**
 * Writes a value the way a person would, so Vue's `v-model` and Editor.js both
 * see an ordinary edit rather than a value that appeared out of nowhere.
 */
function setFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  caret: number,
) {
  element.value = value;
  element.setSelectionRange(caret, caret);
  notifyInput(element);
}

/** True while a replacement is telling the page about itself. */
let announcing = false;

function notifyInput(element: TypographyTarget) {
  announcing = true;
  try {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } finally {
    announcing = false;
  }
}

function caretTextNode(): { node: Text; offset: number } | undefined {
  const selection = document.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0)
    return undefined;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return undefined;
  return { node: node as Text, offset: range.startOffset };
}

function placeCaret(node: Text, offset: number) {
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.length));
  range.collapse(true);
  selectRange(range);
}

/**
 * The Vue side: binds an element for as long as the component lives. Pass a
 * template ref, or a getter that resolves to one.
 *
 * The binding is made on mount rather than from a watcher alone. A getter that
 * reads a flag before the element — `enabled ? field.value : undefined` — never
 * reads the element while the flag is false, so the watcher never learns that
 * the template ref exists and the field is left unbound for good.
 */
export function useSmartTypography(
  target: MaybeRefOrGetter<TypographyTarget | null | undefined>,
  rules: readonly SmartTypographyRule[] = SMART_TYPOGRAPHY_RULES,
) {
  let release: (() => void) | undefined;

  function bind() {
    release?.();
    const element = toValue(target);
    release = element ? bindSmartTypography(element, rules) : undefined;
  }

  onMounted(bind);
  watch(() => toValue(target), bind, { flush: 'post' });

  onBeforeUnmount(() => {
    release?.();
    release = undefined;
  });
}
