import {
  editableFieldOf,
  runEditCommand,
} from '#layers/thei/app/components/content/editor-edit-commands';
import {
  cleanHtml,
  htmlParagraphCount,
  isRichTextField,
} from './editor-text-drop';

/**
 * Words pasted into a field of text go in as one editing command, which
 * Ctrl+Z takes back whole.
 *
 * Editor.js reads a paste of copied rich text as blocks. When the copy is a
 * single paragraph and lands in a paragraph, it writes the words in at the
 * caret behind the undo history's back, and the edits Ctrl+Z replays after
 * that land in the wrong places; landing in a heading or a list, it makes a
 * new paragraph instead. Here one paragraph of rich text goes in where the
 * caret is, as the markup a paragraph keeps, or as words alone in a field of
 * plain text — a heading, a caption.
 *
 * Several paragraphs, files, blocks copied from the editor, plain text and
 * a lone address stay Editor.js's and the other paste handlers': they make
 * blocks, or are already inserted as a command.
 */
export function bindEditorTextPaste(root: HTMLElement) {
  function onPaste(event: ClipboardEvent) {
    const data = event.clipboardData;
    if (!data || data.types.includes('Files')) return;
    if (data.getData('application/x-editor-js')) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html.trim()) return;
    if (/^https?:\/\/\S+$/i.test(text.trim())) return;
    const selection = window.getSelection();
    const field = editableFieldOf(selection?.anchorNode);
    if (
      !field ||
      !root.contains(field) ||
      field !== editableFieldOf(selection?.focusNode)
    )
      return;
    if (htmlParagraphCount(html) > 1) return;

    const rich = isRichTextField(field);
    const words = text.replace(/\s*[\r\n]+\s*/g, ' ');
    const inserted = rich
      ? runEditCommand('insertHTML', cleanHtml(html, text))
      : runEditCommand('insertText', words);
    if (!inserted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  root.addEventListener('paste', onPaste, true);
  return () => root.removeEventListener('paste', onPaste, true);
}
