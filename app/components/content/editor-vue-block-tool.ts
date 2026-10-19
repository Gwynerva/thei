import type { BlockAPI } from '@editorjs/editorjs';
import type { VNode } from 'vue';
import { renderEditorBlock } from './editor-block-render';

/**
 * A block tool whose face is a Vue tree: a card, a gallery, a link preview.
 *
 * The tools differ in what they hold and what they draw; the life of the tree
 * is the same for all of them, and lives here. `render()` makes the wrapper
 * and mounts the view; every change re-renders the view in place, so Vue
 * patches it and components keep their own state. The tree is unmounted when
 * the block leaves the editor — `destroy()` when the editor lets go of it,
 * `removed()` when another block takes its place, which Editor.js does
 * without ever calling `destroy()`.
 *
 * Nothing is mounted in the constructor: Editor.js builds one instance of
 * every tool with empty data while it sets up paste handling, and that
 * instance is never rendered or destroyed.
 */
export abstract class VueBlockTool {
  private wrapper?: HTMLElement;
  private emptyMarks?: MutationObserver;
  /**
   * The block has left the editor. An answer that arrives later — a picked
   * file, an upload, a lookup — has nowhere to go and is dropped.
   */
  protected destroyed = false;

  protected constructor(private readonly toolBlock?: BlockAPI) {}

  /** What the block shows now. */
  protected abstract view(): VNode | null;

  /** Work to start once the block is on the page: a picker, an upload. */
  protected afterRender(): void {}

  /** Anything to let go of besides the tree. */
  protected onDestroy(): void {}

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.emptyMarks = keepEmptyMarks(this.wrapper);
    this.renderContent();
    this.afterRender();
    return this.wrapper;
  }

  removed() {
    this.unmount();
  }

  destroy() {
    this.unmount();
  }

  /** The element the view lives in, to anchor a popup to. */
  protected get element() {
    return this.wrapper;
  }

  protected renderContent() {
    if (!this.wrapper || this.destroyed) return;
    renderEditorBlock(this.view(), this.wrapper);
  }

  /** A change to the block's data: shown, and reported to the editor. */
  protected commit() {
    this.renderContent();
    this.dispatchChange();
  }

  protected dispatchChange() {
    if (!this.destroyed) this.toolBlock?.dispatchChange();
  }

  private unmount() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.onDestroy();
    this.emptyMarks?.disconnect();
    if (this.wrapper) renderEditorBlock(null, this.wrapper);
  }
}

/**
 * Editor.js marks every field of a block `data-empty`, and its styles draw the
 * field's placeholder by that mark. It marks them again only on a change it
 * sees, and it sees none in here: the view changes on its own — a gallery
 * shows another picture's caption — and left alone, the mark of the caption
 * shown first stays, a placeholder over the words of the next. So whatever
 * changes in here marks again the fields Editor.js has marked, by its own
 * test.
 */
function keepEmptyMarks(wrapper: HTMLElement) {
  const observer = new MutationObserver(() => {
    for (const field of wrapper.querySelectorAll<HTMLElement>('[data-empty]')) {
      const empty = emptyToEditor(field) ? 'true' : 'false';
      if (field.dataset.empty !== empty) field.dataset.empty = empty;
    }
  });
  observer.observe(wrapper, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  return observer;
}

const LONE_TAGS = new Set(
  'AREA BASE BR COL COMMAND EMBED HR IMG INPUT KEYGEN LINK META PARAM SOURCE TRACK WBR'.split(
    ' ',
  ),
);
const LINE_BREAKS = new Set(['BR', 'WBR']);

/**
 * Editor.js's own test (`isEmpty`), so that the two never disagree: no leaf
 * with a letter but its first zero-width space, and no lone tag but a line
 * break.
 */
function emptyToEditor(field: Node) {
  const nodes: Node[] = [field];
  for (let node = nodes.shift(); node; node = nodes.shift()) {
    if (node.childNodes.length) {
      nodes.push(...node.childNodes);
      continue;
    }
    if (
      node instanceof Element &&
      LONE_TAGS.has(node.tagName) &&
      !LINE_BREAKS.has(node.tagName)
    )
      return false;
    if ((node.textContent ?? '').replace('​', '')) return false;
  }
  return true;
}

function createToolWrapper() {
  const element = document.createElement('div');
  element.className = 'my-sm flex flex-col gap-xs';
  // The tools report every data change themselves through dispatchChange().
  // Their Vue-rendered previews also update asynchronously while media loads;
  // those presentation-only DOM mutations are kept out of Editor.js's change
  // tracking.
  element.dataset.mutationFree = 'true';
  return element;
}
