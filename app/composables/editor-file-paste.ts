import type EditorJS from '@editorjs/editorjs';
import {
  insertPlacedFiles,
  placeContentFilesOf,
  prepareContentFiles,
  type SkippedContentFile,
} from './content-files';

/**
 * Files pasted into an empty paragraph become the blocks the one rule makes
 * of them (`placeContentFiles`), as files picked with the "+" do: one
 * picture or video a picture, several a gallery; one other file a player or
 * a file to download, several a group. Each block stores its own new files at
 * its defaults; improving them is the usual editing of each file afterwards.
 *
 * This does not go through Editor.js's own file paste: that hands every file
 * to a tool separately and would stack up one block per file.
 *
 * Anything else — text, or a file pasted into a paragraph with words in it,
 * as a copy from an office suite brings a picture of its text along — is
 * left to Editor.js. A file the site cannot store is told of, and the rest
 * are placed.
 */
export function bindEditorFilePaste(
  holder: HTMLElement,
  editor: EditorJS,
  options: { onSkipped: (skipped: SkippedContentFile[]) => void },
) {
  const onPaste = (event: ClipboardEvent) => {
    const pasted = Array.from(event.clipboardData?.files ?? []);
    if (!pasted.length) return;
    // The paragraph is the one the paste lands in, as Editor.js finds it
    // itself. Its current block lags behind a caret moved without a press —
    // a focus given back by a closing dialog — and a paste read from it would
    // be cancelled by Editor.js and go nowhere.
    const target = event.target;
    const block =
      target instanceof HTMLElement
        ? editor.blocks.getBlockByElement(target)
        : undefined;
    if (!block || block.name !== 'paragraph' || !block.isEmpty) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { files, skipped } = prepareContentFiles(pasted);
    if (skipped.length) options.onSkipped(skipped);
    const index = editor.blocks.getBlockIndex(block.id);
    // The first block takes the paragraph's place, and has the caret; the
    // rest follow it.
    placeContentFilesOf([], files).forEach((placed, offset) =>
      insertPlacedFiles(
        editor.blocks,
        placed,
        index + offset,
        offset === 0,
        offset === 0,
      ),
    );
  };
  // Capture, so the paste is claimed before Editor.js's own handler sees it.
  holder.addEventListener('paste', onPaste, true);
  return () => holder.removeEventListener('paste', onPaste, true);
}
