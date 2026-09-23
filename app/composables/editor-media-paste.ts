import type EditorJS from '@editorjs/editorjs';

/**
 * Pictures and videos pasted into an empty paragraph become media.
 *
 * One file becomes a media block, several become one gallery — which is why
 * this does not go through Editor.js's own file paste: that hands every file
 * to a tool separately and would stack up one block per picture. The files
 * are stored as they are, and the paragraph they were pasted into is
 * replaced; improving them is the usual editing of each file afterwards.
 *
 * Anything else — text, a file pasted into a paragraph with words in it, a
 * document — is left to Editor.js.
 */
export function bindEditorMediaPaste(holder: HTMLElement, editor: EditorJS) {
  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      /^(?:image|video)\//.test(file.type),
    );
    if (!files.length) return;
    const index = editor.blocks.getCurrentBlockIndex();
    const block = index >= 0 ? editor.blocks.getBlockByIndex(index) : undefined;
    if (!block || block.name !== 'paragraph' || !block.isEmpty) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (files.length === 1)
      editor.blocks.insert(
        'contentMedia',
        { layout: 'centered', files },
        undefined,
        index,
        true,
        true,
      );
    else
      editor.blocks.insert(
        'contentGallery',
        { items: [], files },
        undefined,
        index,
        true,
        true,
      );
  };
  // Capture, so the paste is claimed before Editor.js's own handler sees it.
  holder.addEventListener('paste', onPaste, true);
  return () => holder.removeEventListener('paste', onPaste, true);
}
