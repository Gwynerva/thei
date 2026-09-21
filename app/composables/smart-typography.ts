import {
  onBeforeUnmount,
  onMounted,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';

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
    const input = event as InputEvent;
    if (input.inputType && !input.inputType.startsWith('insert')) {
      pending = undefined;
      return;
    }
    pending = applyReplacement(element, rules);
  }

  function onSelectionChange() {
    pending = undefined;
  }

  element.addEventListener('beforeinput', onBeforeInput);
  element.addEventListener('input', onInput);
  element.addEventListener('blur', onSelectionChange);
  element.addEventListener('pointerdown', onSelectionChange);

  return () => {
    element.removeEventListener('beforeinput', onBeforeInput);
    element.removeEventListener('input', onInput);
    element.removeEventListener('blur', onSelectionChange);
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
    const next =
      element.value.slice(0, edit.start) +
      edit.replacement +
      element.value.slice(caret);
    const position = edit.start + edit.replacement.length;
    setFieldValue(element, next, position);
    return edit;
  }

  const point = caretTextNode();
  if (!point) return undefined;
  const { node, offset } = point;
  const edit = smartTypographyEdit((node.data ?? '').slice(0, offset), rules);
  if (!edit) return undefined;
  node.replaceData(edit.start, edit.original.length, edit.replacement);
  placeCaret(node, edit.start + edit.replacement.length);
  notifyInput(element);
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
    const next =
      element.value.slice(0, pending.start) +
      pending.original +
      element.value.slice(end);
    setFieldValue(element, next, pending.start + pending.original.length);
    return true;
  }

  const point = caretTextNode();
  if (!point) return false;
  const { node, offset } = point;
  const end = pending.start + pending.replacement.length;
  if (offset !== end) return false;
  if ((node.data ?? '').slice(pending.start, end) !== pending.replacement)
    return false;
  node.replaceData(pending.start, pending.replacement.length, pending.original);
  placeCaret(node, pending.start + pending.original.length);
  notifyInput(element);
  return true;
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
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.length));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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
