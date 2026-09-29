/**
 * The current block: the one the keyboard is in, and the one Enter acts on.
 *
 * Editor.js keeps a current block of its own, but acts on Enter only when the
 * key is typed into a field it laid out itself, and reads the caret there.
 * Anywhere else it does nothing or worse: a click on a picture leaves the
 * focus on the dialog, so the key never reaches the block; a caption of a
 * block created in this session is a field it lost track of while the block
 * was still a placeholder, and its `split()` throws; a caption it did track
 * is split at the caret, and the rest of it carried off into a new paragraph.
 *
 * So the rule is made explicit here. Blocks Editor.js lays out as text
 * (`textBlocks`) keep its Enter: split, insert before, insert after. Every
 * other block — a picture, a gallery, a card, a divider, a bracket — can take
 * the focus itself, and Enter there, in its one-line fields, or on the part of
 * it last clicked means one thing: a new paragraph right after the block. The
 * editor's styles light the block the focus is in (`editor.css`).
 *
 * Blocks are told apart by their tool's name only. Reading a block's fields
 * through the API (`focusable`, `inputs`) makes Editor.js remember the fields
 * it sees at that moment, which is how a caption gets lost in the first place.
 */

import type EditorJS from '@editorjs/editorjs';
import { hideKeyFromEditor } from './editor-keyboard-boundary';

const BLOCK_SELECTOR = '.ce-block';
const REDACTOR_SELECTOR = '.codex-editor__redactor';
const SELECTED_BLOCK_SELECTOR = '.ce-block--selected';
const OPEN_MENU_SELECTOR = '.ce-popover--opened';
const FIELD_SELECTOR =
  '[contenteditable]:not([contenteditable="false"]), input, textarea, select';
/**
 * A field that holds one line: the captions of the media blocks and the
 * fields of an attachment say so of themselves; the caption of a quote is the
 * plugin's own.
 */
const LINE_FIELD_SELECTOR = '[aria-multiline="false"]';
const QUOTE_CAPTION_SELECTOR = '.cdx-quote__caption';
const CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
].join(', ');

/**
 * Where a key was typed.
 *
 * - `outside`: not in a block — the toolbar, a field inside a menu.
 * - `text`: the text of a block Editor.js lays out.
 * - `line`: a field that holds one line.
 * - `field`: any other field of a block that is not text.
 * - `control`: a button, a link or a tile inside such a block.
 * - `block`: the block itself, or a part of it with nothing to act on.
 */
export type EditorKeyPlace =
  'outside' | 'text' | 'line' | 'field' | 'control' | 'block';

export interface EditorEnterContext {
  place: EditorKeyPlace;
  /** The place is in a block that is not text, or in one that is not known. */
  object: boolean;
  /** An input method is composing; its Enter commits the composition. */
  composing: boolean;
  /** Shift, Ctrl, Alt or Meta is held. */
  modified: boolean;
  /** Something before has already claimed the key. */
  handled: boolean;
  /** One of Editor.js's menus is open. */
  menuOpen: boolean;
  /**
   * A block is still selected — its settings are open, say. Enter over
   * selected blocks is taken before this point otherwise.
   */
  blocksSelected: boolean;
  /** The selection is a caret, not a range of text. */
  collapsed: boolean;
  /** The focused element got the focus from a click or a tap. */
  pointerFocused: boolean;
}

/**
 * - `pass`: Editor.js and the target, as before.
 * - `hide`: the target's own Enter; Editor.js does not see it.
 * - `swallow`: nothing happens.
 * - `insert-after`: a new paragraph right after the block.
 */
export type EditorEnterAction = 'pass' | 'hide' | 'swallow' | 'insert-after';

/** What Enter does, typed where the context says. */
export function editorEnterAction(
  context: EditorEnterContext,
): EditorEnterAction {
  if (context.composing || context.place === 'outside') return 'pass';

  if (!context.object) {
    // The selected block is the editor's current one, and its Enter would
    // split that block, where no caret is.
    if (context.blocksSelected) return 'swallow';
    // The caption of a quote. Shift+Enter keeps its line break.
    if (context.place !== 'line' || context.modified || context.handled)
      return 'pass';
    return !context.menuOpen && context.collapsed ? 'insert-after' : 'swallow';
  }

  // Past this point Editor.js never sees an Enter: in a block that is not
  // text it would split a caption, or throw. The key is hidden even when it
  // was claimed already, as the inline toolbar claims it while it is open.
  if (context.modified || context.handled || context.menuOpen) return 'hide';
  switch (context.place) {
    case 'line':
      return context.collapsed ? 'insert-after' : 'swallow';
    case 'field':
      return 'hide';
    case 'control':
      // A button or a tile reached with the keyboard does what it does; one
      // just clicked has done it already, and Enter moves on.
      return context.pointerFocused ? 'insert-after' : 'hide';
    default:
      return 'insert-after';
  }
}

/**
 * Whether Enter should add a paragraph after the selected blocks.
 *
 * Editor.js takes Enter over selected blocks as a key typed over them: the
 * blocks are removed and an empty paragraph put in their place — a picture
 * reached with the arrows, or a few blocks framed with the mouse, gone for a
 * key that everywhere else only adds a line. Here it adds one after them, and
 * the blocks stay; Backspace and typed text still replace them. Shift+Enter
 * and the rest too: none of them is typing over the blocks.
 */
export function editorSelectedBlocksTakeEnter(context: {
  composing: boolean;
  handled: boolean;
  menuOpen: boolean;
  selectedBlocks: number;
  textSelected: boolean;
}) {
  return (
    !context.composing &&
    !context.handled &&
    !context.menuOpen &&
    context.selectedBlocks > 0 &&
    !context.textSelected
  );
}

export interface EditorCurrentBlockOptions {
  /** The blocks whose text Editor.js lays out; Enter there stays its own. */
  textBlocks: ReadonlySet<string>;
}

export function bindEditorCurrentBlock(
  root: HTMLElement,
  editor: EditorJS,
  options: EditorCurrentBlockOptions,
) {
  const focusable = new Set<HTMLElement>();
  /** What the last click or tap in the editor pressed, until it focuses. */
  let pressed: Node | undefined;
  /** The element the last click or tap focused. */
  let pointerFocus: Element | undefined;

  function isObjectBlock(block: HTMLElement) {
    const name = editor.blocks.getBlockByElement(block)?.name;
    // A block that cannot be told is not trusted to Editor.js.
    return name === undefined || !options.textBlocks.has(name);
  }

  function blockOf(target: EventTarget | null) {
    if (!(target instanceof Element)) return undefined;
    const block = target.closest<HTMLElement>(BLOCK_SELECTOR);
    return block && root.contains(block) ? block : undefined;
  }

  function placeOf(target: Element, block: HTMLElement, object: boolean) {
    const field = target.closest<HTMLElement>(FIELD_SELECTOR);
    const inBlock = field && block.contains(field) ? field : undefined;
    if (!object)
      return inBlock?.closest(QUOTE_CAPTION_SELECTOR) ? 'line' : 'text';
    if (inBlock) return inBlock.matches(LINE_FIELD_SELECTOR) ? 'line' : 'field';
    const control = target.closest(CONTROL_SELECTOR);
    if (control && block.contains(control)) return 'control';
    return 'block';
  }

  function selectedBlocks() {
    return root.querySelectorAll<HTMLElement>(SELECTED_BLOCK_SELECTOR);
  }

  function menuOpen() {
    return root.querySelector(OPEN_MENU_SELECTOR) !== null;
  }

  function composing(event: KeyboardEvent) {
    // Safari reports the Enter that commits a composition as not composing.
    return event.isComposing || event.keyCode === 229;
  }

  function modified(event: KeyboardEvent) {
    return event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
  }

  function collapsed() {
    return window.getSelection()?.isCollapsed ?? true;
  }

  function insertAfter(block: HTMLElement) {
    const api = editor.blocks.getBlockByElement(block);
    if (!api) return;
    const index = editor.blocks.getBlockIndex(api.id);
    if (index === undefined || index < 0) return;
    const inserted = editor.blocks.insert(
      undefined,
      undefined,
      undefined,
      index + 1,
      true,
    );
    editor.caret.setToBlock(inserted, 'start');
    editor.toolbar.open();
    // The caret is placed without scrolling the modal it is in.
    inserted.holder.scrollIntoView({ block: 'nearest' });
  }

  function consume(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * A block that is not text can take the focus itself, but stays out of
   * the order of Tab: a click on a picture, beside it, on a divider or on a
   * bracket makes it the current block.
   */
  function decorate() {
    const redactor = root.querySelector(REDACTOR_SELECTOR);
    const present = new Set<HTMLElement>();
    for (const block of redactor?.children ?? []) {
      if (!(block instanceof HTMLElement) || !block.matches(BLOCK_SELECTOR))
        continue;
      if (isObjectBlock(block)) {
        present.add(block);
        if (block.getAttribute('tabindex') !== '-1') block.tabIndex = -1;
      } else if (focusable.has(block)) {
        // The same element, now text: a conversion Editor.js did in place.
        block.removeAttribute('tabindex');
      }
    }
    focusable.clear();
    for (const block of present) focusable.add(block);
  }

  /**
   * Enter over selected blocks: a paragraph after the last of them. Read
   * before Editor.js, which would remove them and stop the key there.
   */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (!(target instanceof Node) || !root.contains(target)) return;
    const selected = selectedBlocks();
    const last = selected[selected.length - 1];
    if (
      !last ||
      !editorSelectedBlocksTakeEnter({
        composing: composing(event),
        handled: event.defaultPrevented,
        menuOpen: menuOpen(),
        selectedBlocks: selected.length,
        // The caret stays in the field the arrows left, collapsed; text is
        // selected only when there is a range of it.
        textSelected: !collapsed(),
      })
    )
      return;
    consume(event);
    insertAfter(last);
  }

  /**
   * Every key typed in a block, after Editor.js has had its say about
   * selected blocks and its menus, and before the block's own handling.
   */
  function onKeydown(event: KeyboardEvent) {
    const fromPointer = pointerFocus === event.target;
    // A key moves on from the last press: the focus it brings is its own.
    pressed = undefined;
    const target = event.target;
    const block = blockOf(target);
    if (!block || !(target instanceof Element)) return;
    const object = isObjectBlock(block);
    const place = placeOf(target, block, object);

    if (event.key !== 'Enter') {
      // The block itself has the focus: a place Editor.js has no caret in,
      // and was never shown a key from before it could take the focus.
      if (object && place === 'block' && !composing(event))
        hideKeyFromEditor(event);
      return;
    }

    const action = editorEnterAction({
      place,
      object,
      composing: composing(event),
      modified: modified(event),
      handled: event.defaultPrevented,
      menuOpen: menuOpen(),
      blocksSelected: selectedBlocks().length > 0,
      collapsed: collapsed(),
      pointerFocused: fromPointer,
    });
    if (action === 'pass') return;
    hideKeyFromEditor(event);
    if (action === 'hide') return;
    if (action === 'swallow') {
      event.preventDefault();
      return;
    }
    consume(event);
    insertAfter(block);
  }

  /**
   * Enter from a phone's keyboard, which often sends no key for it and only
   * asks for a new paragraph. The fields cancel that themselves; here it
   * means what Enter means.
   */
  function onBeforeInput(event: InputEvent) {
    if (event.inputType !== 'insertParagraph') return;
    const target = event.target;
    const block = blockOf(target);
    if (!block || !(target instanceof Element)) return;
    if (placeOf(target, block, isObjectBlock(block)) !== 'line') return;
    consume(event);
    if (collapsed()) insertAfter(block);
  }

  /**
   * A paste while the block itself has the focus. Before a block could take
   * the focus such a paste went nowhere, and it still does: Editor.js would
   * paste into whatever its current field is.
   */
  function onPaste(event: ClipboardEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(BLOCK_SELECTOR))
      return;
    if (!root.contains(target) || !isObjectBlock(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPointerDown(event: PointerEvent) {
    pressed = event.target instanceof Node ? event.target : undefined;
  }

  function onPointerCancel() {
    // A swipe that scrolled: nothing was pressed.
    pressed = undefined;
  }

  function onFocusIn(event: FocusEvent) {
    const target = event.target;
    pointerFocus =
      pressed && target instanceof Element && target.contains(pressed)
        ? target
        : undefined;
    pressed = undefined;
  }

  /**
   * A click on a part of a block with nothing to focus focuses the block;
   * WebKit may not do it on a tap by itself.
   */
  function onClick(event: MouseEvent) {
    const target = event.target;
    const block = blockOf(target);
    if (!block || !(target instanceof Element) || !focusable.has(block)) return;
    if (placeOf(target, block, true) !== 'block') return;
    if (block.contains(document.activeElement)) return;
    if (selectedBlocks().length) return;
    block.focus({ preventScroll: true });
  }

  decorate();
  const observer = new MutationObserver(decorate);
  const redactor = root.querySelector(REDACTOR_SELECTOR);
  if (redactor) observer.observe(redactor, { childList: true });

  // The window hears the event before the document, where Editor.js listens.
  window.addEventListener('keydown', onWindowKeydown, true);
  window.addEventListener('paste', onPaste, true);
  root.addEventListener('keydown', onKeydown, true);
  root.addEventListener('beforeinput', onBeforeInput, true);
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('pointercancel', onPointerCancel, true);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('click', onClick);

  return () => {
    observer.disconnect();
    window.removeEventListener('keydown', onWindowKeydown, true);
    window.removeEventListener('paste', onPaste, true);
    root.removeEventListener('keydown', onKeydown, true);
    root.removeEventListener('beforeinput', onBeforeInput, true);
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('pointercancel', onPointerCancel, true);
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('click', onClick);
    for (const block of focusable) block.removeAttribute('tabindex');
    focusable.clear();
  };
}
