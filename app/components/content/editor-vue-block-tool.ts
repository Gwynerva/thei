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
    if (this.wrapper) renderEditorBlock(null, this.wrapper);
  }
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
