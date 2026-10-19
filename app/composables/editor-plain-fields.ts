import type EditorJS from '@editorjs/editorjs';

/**
 * Keeps Editor.js's inline toolbar away while `unwanted` says so: it is
 * closed again the moment it opens, before it is drawn — a mutation is seen
 * before the page is drawn again — and its shortcuts go with it. Only the
 * toolbar is watched, so the text and what is drawn round it ask nothing.
 */
export function guardInlineToolbar(
  holder: HTMLElement,
  editor: EditorJS,
  unwanted: () => boolean,
) {
  const toolbar = holder.querySelector('.ce-inline-toolbar');
  if (!toolbar) return () => {};
  const observer = new MutationObserver(() => {
    if (toolbar.querySelector('.ce-popover--opened') && unwanted())
      editor.inlineToolbar.close();
  });
  observer.observe(toolbar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

/**
 * A field of a block that holds plain words — a file's title, a group's —
 * takes no marks. Its block has Editor.js's inline toolbar for the caption
 * beside it, and Editor.js opens that toolbar over any selection in the
 * block; over a plain field it is closed again the moment it opens.
 */
export function bindEditorPlainFields(holder: HTMLElement, editor: EditorJS) {
  return guardInlineToolbar(holder, editor, () => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return Boolean(
      element &&
      holder.contains(element) &&
      element.closest('[contenteditable="plaintext-only"]'),
    );
  });
}
