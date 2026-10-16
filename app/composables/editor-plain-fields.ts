import type EditorJS from '@editorjs/editorjs';

/**
 * A field of a block that holds plain words — a file's title, a group's —
 * takes no marks. Its block has Editor.js's inline toolbar for the caption
 * beside it, and Editor.js opens that toolbar over any selection in the
 * block; over a plain field it is closed again the moment it opens, before
 * it is drawn, and its shortcuts go with it.
 */
export function bindEditorPlainFields(holder: HTMLElement, editor: EditorJS) {
  const toolbar = holder.querySelector('.ce-inline-toolbar');
  if (!toolbar) return () => {};

  function inPlainField() {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return Boolean(
      element &&
      holder.contains(element) &&
      element.closest('[contenteditable="plaintext-only"]'),
    );
  }

  // A mutation is seen before the page is drawn again, so the toolbar
  // opened over a plain field never shows.
  const observer = new MutationObserver(() => {
    if (toolbar.querySelector('.ce-popover--opened') && inPlainField())
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
