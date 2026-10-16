import type EditorJS from '@editorjs/editorjs';
import type { BlockAPI } from '@editorjs/editorjs';
import type { VirtualElement } from '@floating-ui/vue';
import { editorBlockNextTo } from './editor-dom';
import { hideKeyFromEditor } from './editor-keyboard-boundary';

/**
 * The blocks the "+" of the editor offers, as a grid of tiles of our own
 * (`ContentBlockToolbox.vue`) rather than Editor.js's list: a list cannot
 * show its hints above the dialog it stands in, nor move in two directions.
 * The tools stay declared as Editor.js reads them — their `toolbox` is also
 * what its "Convert to" offers — and the grid is read from them.
 */

/** One tile: a block of a tool, with the data the tool is started with. */
export interface EditorToolboxEntry {
  /** The tool's name, then the place of the entry when it has several. */
  key: string;
  tool: string;
  title: string;
  /** Editor.js's icon markup: an SVG of the site's own sprite. */
  icon: string;
  data?: Record<string, unknown>;
}

type ToolboxSettings = {
  title?: string;
  icon?: string;
  data?: Record<string, unknown>;
};
type ToolSettings = {
  class?: { toolbox?: ToolboxSettings | ToolboxSettings[]; isInline?: boolean };
  toolbox?: ToolboxSettings | ToolboxSettings[] | false;
};

/**
 * The tiles of the tools given to Editor.js, in their order, each entry of
 * a tool with several its own tile. A title the tool declares in English
 * goes through `translate`, as Editor.js would through its `toolNames`.
 */
export function editorToolboxEntries(
  tools: Record<string, unknown>,
  translate: (title: string) => string,
): EditorToolboxEntry[] {
  const entries: EditorToolboxEntry[] = [];
  for (const [tool, value] of Object.entries(tools)) {
    const settings: ToolSettings =
      typeof value === 'function'
        ? { class: value as ToolSettings['class'] }
        : (value as ToolSettings);
    if (settings.class?.isInline || settings.toolbox === false) continue;
    const declared = settings.toolbox ?? settings.class?.toolbox;
    if (!declared) continue;
    const list = Array.isArray(declared) ? declared : [declared];
    list.forEach((item, index) => {
      if (!item.title || !item.icon) return;
      entries.push({
        key: list.length > 1 ? `${tool}:${index}` : tool,
        tool,
        title: translate(item.title),
        icon: item.icon,
        ...(item.data ? { data: item.data } : {}),
      });
    });
  }
  return entries;
}

const ORDER_KEY = 'thei-editor-toolbox';

/** The order the owner gave the tiles, kept in this browser. */
export function storedToolboxOrder(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === 'string')
      : [];
  } catch {
    return [];
  }
}

export function storeToolboxOrder(keys: readonly string[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(keys));
  } catch {
    // A browser that keeps nothing shows the tools' own order next time.
  }
}

/**
 * The tiles in the order kept: the ones it names first, as it names them;
 * a tile it does not know — a block added since — after them, in its place
 * among the tools.
 */
export function orderToolboxEntries(
  entries: readonly EditorToolboxEntry[],
  order: readonly string[],
): EditorToolboxEntry[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const known = order.flatMap((key) => byKey.get(key) ?? []);
  const kept = new Set(known.map((entry) => entry.key));
  return [...known, ...entries.filter((entry) => !kept.has(entry.key))];
}

/**
 * Opens the grid where Editor.js would open its list: for the block beside
 * the "+", and from the keyboard, Ctrl/Cmd+Shift+/, for the block the caret
 * is in. The "+" and the settings button keep no tooltip of Editor.js's
 * own: their hints are the site's, and the "+"'s names no "/", which types
 * a slash.
 */
export function bindEditorBlockToolbox(
  root: HTMLElement,
  editor: EditorJS,
  options: { open: (anchor: VirtualElement, block: BlockAPI) => void },
) {
  const plusOf = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>('.ce-toolbar__plus')
      : null;

  function onClick(event: MouseEvent) {
    const plus = plusOf(event.target);
    if (!plus || !root.contains(plus)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const index = editor.blocks.getCurrentBlockIndex();
    const element = editorBlockNextTo(
      root,
      plus,
      index >= 0 ? editor.blocks.getBlockByIndex(index)?.holder : undefined,
    );
    const block = element?.dataset.id
      ? editor.blocks.getById(element.dataset.id)
      : null;
    if (block)
      options.open(anchorAt(plus.getBoundingClientRect(), block.holder), block);
  }

  // Reaches the buttons before the tooltips Editor.js hangs on them.
  function onMouseEnter(event: MouseEvent) {
    if (
      event.target instanceof Element &&
      event.target.matches('.ce-toolbar__plus, .ce-toolbar__settings-btn')
    )
      event.stopPropagation();
  }

  function onKeydown(event: KeyboardEvent) {
    if (
      event.code !== 'Slash' ||
      !event.shiftKey ||
      !(event.ctrlKey || event.metaKey) ||
      !(event.target instanceof Node) ||
      !root.contains(event.target)
    )
      return;
    event.preventDefault();
    // Editor.js would open the settings of the block for its Ctrl+/.
    hideKeyFromEditor(event);
    const index = editor.blocks.getCurrentBlockIndex();
    const block = index >= 0 ? editor.blocks.getBlockByIndex(index) : undefined;
    if (block)
      options.open(anchorAt(caretIn(block.holder), block.holder), block);
  }

  root.addEventListener('click', onClick, true);
  root.addEventListener('mouseenter', onMouseEnter, true);
  window.addEventListener('keydown', onKeydown, true);
  const plus = root.querySelector<HTMLElement>('.ce-toolbar__plus');
  const settings = root.querySelector<HTMLElement>('.ce-toolbar__settings-btn');
  return {
    /** Sets the hints the "+" and the settings button show, the site's way. */
    hint(text: { add: string; settings: string }) {
      // Named, not buttons of their own: the keyboard opens the grid with
      // Ctrl/Cmd+Shift+/ from the text, and the settings with Ctrl/Cmd+/.
      for (const [button, words] of [
        [plus, text.add],
        [settings, text.settings],
      ] as const) {
        if (!button) continue;
        button.dataset.titlePopup = words;
        // A tap is the button's: its action is Editor.js's handler.
        button.dataset.titlePopupPress = 'hold';
        button.setAttribute('aria-label', words);
      }
    },
    destroy() {
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('mouseenter', onMouseEnter, true);
      window.removeEventListener('keydown', onKeydown, true);
    },
  };
}

/**
 * A place that stays where `at` was beside `block` when the grid opened,
 * and moves with the block. Not the "+" itself: Editor.js moves it from
 * block to block as the pointer goes, and hides it.
 */
function anchorAt(at: DOMRect, block: HTMLElement): VirtualElement {
  const from = block.getBoundingClientRect();
  const rect = () => {
    const now = block.getBoundingClientRect();
    return new DOMRect(
      at.left - from.left + now.left,
      at.top - from.top + now.top,
      at.width,
      at.height,
    );
  };
  return {
    contextElement: block,
    getBoundingClientRect: rect,
    getClientRects: () => [rect()],
  };
}

/** Where the caret is in a block, or the start of the block. */
function caretIn(block: HTMLElement): DOMRect {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const rect =
    range && block.contains(range.startContainer)
      ? range.getBoundingClientRect()
      : undefined;
  if (rect && (rect.width || rect.height)) return rect;
  const box = block.getBoundingClientRect();
  return new DOMRect(box.left, box.top, 0, Math.min(box.height, 24));
}

/**
 * Puts the tile's block in as Editor.js's own list does: in place of the
 * block when that one is empty, after it otherwise, with the data the entry
 * starts it with, the caret in it. A block with no field of its own — a
 * divider — is no place for the caret: it goes on to the next block, or a
 * new paragraph after the last one.
 */
export async function insertToolboxBlock(
  editor: EditorJS,
  block: BlockAPI,
  entry: EditorToolboxEntry,
) {
  const index = editor.blocks.getBlockIndex(block.id);
  if (index === undefined || index < 0) return;
  const replace = block.isEmpty;
  const at = replace ? index : index + 1;
  const data = entry.data
    ? {
        ...(await editor.blocks.composeBlockData(entry.tool)),
        ...entry.data,
      }
    : undefined;
  const inserted = editor.blocks.insert(
    entry.tool,
    data,
    undefined,
    at,
    undefined,
    replace,
  );
  inserted.call('appendCallback');
  editor.caret.setToBlock(at);
  editor.toolbar.close();
  const hasField = inserted.holder.querySelector(
    '[contenteditable="true"], input, textarea',
  );
  if (hasField) return;
  if (at === editor.blocks.getBlocksCount() - 1) {
    editor.blocks.insert(undefined, undefined, undefined, at + 1);
    editor.caret.setToBlock(at + 1);
  } else editor.caret.setToBlock(at + 1);
}
