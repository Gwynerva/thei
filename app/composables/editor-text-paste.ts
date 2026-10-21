import {
  insertHtmlAt,
  runEditCommand,
} from '#layers/thei/app/components/content/editor-edit-commands';
import { editableFieldOf } from './editor-inline-dom';
import type { EditorInlineKeep } from './editor-inline-keep';
import {
  cleanHtml,
  htmlParagraphCount,
  isRichTextField,
  plainText,
} from './editor-text-drop';

/**
 * Words pasted into a field of text go in as one editing command, which
 * Ctrl+Z takes back whole, and where typing would put them.
 *
 * Editor.js reads a paste as blocks. When the copy is a single line and
 * lands in a paragraph, it writes the words in at the caret behind the undo
 * history's back — splitting the bold or the link the caret stands in — and
 * the edits Ctrl+Z replays after that land in the wrong places; landing in a
 * heading or a list, it makes a new paragraph instead. Here one line, plain
 * or rich, goes in where the caret is, as the markup a paragraph keeps, or
 * as words alone in a field of plain text — a heading, a caption — and
 * against markup where words typed there would go (`inline`): into the link
 * the caret is in, beside the bold it stands after, in place of an
 * offered name.
 *
 * Several paragraphs, files, blocks copied from the editor and a lone
 * address stay Editor.js's and the other paste handlers': they make blocks,
 * or are already inserted as a command.
 */
export function bindEditorTextPaste(
  root: HTMLElement,
  inline: EditorInlineKeep,
) {
  function onPaste(event: ClipboardEvent) {
    const data = event.clipboardData;
    if (!data || data.types.includes('Files')) return;
    if (data.getData('application/x-editor-js')) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (/^https?:\/\/\S+$/i.test(text.trim())) return;
    const selection = window.getSelection();
    const field = editableFieldOf(selection?.anchorNode, root);
    if (
      !field ||
      field !== editableFieldOf(selection?.focusNode) ||
      !selection?.rangeCount
    )
      return;
    if (html.trim() ? htmlParagraphCount(html) > 1 : /[\r\n]/.test(text.trim()))
      return;

    const words = plainText(text);
    const rich =
      isRichTextField(field) && html.trim() ? cleanHtml(html, text) : '';
    if (!words && !rich) return;
    const inserted =
      inline.write(words, rich || undefined) ||
      (rich
        ? insertHtmlAt(selection.getRangeAt(0), rich)
        : runEditCommand('insertText', words));
    if (!inserted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  root.addEventListener('paste', onPaste, true);
  return () => root.removeEventListener('paste', onPaste, true);
}
