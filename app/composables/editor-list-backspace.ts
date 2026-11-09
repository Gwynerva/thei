import type { API, BlockAPI } from '@editorjs/editorjs';

/**
 * What `@editorjs/list` keeps of a list as it is edited: its items and the
 * keys it answers. One is made for each style of the list, anew when the
 * style changes; none of this is in its types.
 */
export interface ListTabulator {
  api: API;
  block: BlockAPI;
  currentItem: HTMLElement | null;
  renderer: { getItemContent(item: Element): string };
  backspace(event: Pick<Event, 'stopPropagation' | 'preventDefault'>): void;
  convertItemToDefaultBlock(index?: number, removeList?: boolean): void;
}

/**
 * The list answers Backspace only by its `keydown`. A phone's keyboard names
 * no key there — `Unidentified` — and sends the deletion as `beforeinput`
 * alone, which in an empty item deletes nothing. That deletion is put to the
 * list's own Backspace, under its own conditions: at the start of the first
 * item it becomes a paragraph, at the start of any other it joins the one
 * before. A real Backspace just pressed was the list's already, and one an
 * earlier listener took — the last of emptied markup — stays taken.
 */
export function bindListBackspace(
  holder: HTMLElement,
  tabulator: () => ListTabulator,
) {
  let backspacePressed = false;
  const onKeyDown = (event: KeyboardEvent) => {
    backspacePressed = event.key === 'Backspace';
  };
  const onBeforeInput = (event: InputEvent) => {
    const pressed = backspacePressed;
    backspacePressed = false;
    // A deletion that cannot be stopped — a keyboard's composition in some
    // states — is the browser's: the list's own would come on top of it.
    if (
      pressed ||
      event.defaultPrevented ||
      !event.cancelable ||
      event.inputType !== 'deleteContentBackward'
    )
      return;
    // The list says it took the key by stopping it, and prevents the key
    // only where it moves the caret itself; here both stop the deletion.
    let taken = false;
    tabulator().backspace({
      stopPropagation: () => (taken = true),
      preventDefault: () => (taken = true),
    });
    if (!taken) return;
    event.preventDefault();
    event.stopPropagation();
  };
  holder.addEventListener('keydown', onKeyDown, true);
  holder.addEventListener('beforeinput', onBeforeInput, true);
}

const keptInText = new WeakSet<object>();

/**
 * An item turned into a paragraph takes the whole list with it when it was
 * the last: the list deletes itself, then adds the paragraph. When the list
 * was the only block, Editor.js fills the emptied text with a paragraph of
 * its own in between, so two are left, and the caret in the wrong one. Here
 * the paragraph comes first and the list goes after it, by its id: the text
 * is never empty.
 */
export function keepListInText(tabulator: ListTabulator) {
  const prototype = Object.getPrototypeOf(tabulator) as ListTabulator;
  if (keptInText.has(prototype)) return;
  keptInText.add(prototype);
  prototype.convertItemToDefaultBlock = function (
    this: ListTabulator,
    index?: number,
    removeList?: boolean,
  ) {
    const item = this.currentItem;
    const text = item ? this.renderer.getItemContent(item) : '';
    const paragraph =
      index === undefined
        ? this.api.blocks.insert()
        : this.api.blocks.insert(undefined, { text }, undefined, index);
    if (removeList)
      this.api.blocks.delete(this.api.blocks.getBlockIndex(this.block.id));
    item?.remove();
    this.api.caret.setToBlock(paragraph, 'start');
  };
}
