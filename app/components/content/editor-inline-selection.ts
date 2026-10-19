import { HORIZONTAL_SPACE_CHARACTERS } from '#layers/thei/shared/content-link';
import {
  caretAfterLetters,
  editableFieldOf,
  lettersBefore,
} from '#layers/thei/app/composables/editor-inline-dom';
import { selectRange } from './editor-edit-commands';

const INLINE_HORIZONTAL_SPACE = new RegExp(`[${HORIZONTAL_SPACE_CHARACTERS}]`);

export function trimInlineSelectionOffsets(
  text: string,
  start = 0,
  end = text.length,
): { start: number; end: number } | undefined {
  let nextStart = Math.max(0, Math.min(start, text.length));
  let nextEnd = Math.max(nextStart, Math.min(end, text.length));
  while (nextStart < nextEnd && INLINE_HORIZONTAL_SPACE.test(text[nextStart]!))
    nextStart++;
  while (
    nextEnd > nextStart &&
    INLINE_HORIZONTAL_SPACE.test(text[nextEnd - 1]!)
  )
    nextEnd--;
  return nextStart === nextEnd ? undefined : { start: nextStart, end: nextEnd };
}

/**
 * The same range without the spaces at its edges: a double click, or a drag
 * to the end of a word, picks up the space beside it, and a link or a hint
 * should not. `undefined` when there is nothing but spaces. A range that does
 * not lie within one editable field is returned as it is.
 */
export function trimInlineRange(range: Range): Range | undefined {
  if (range.collapsed) return range;
  const field = editableFieldOf(range.startContainer);
  if (!field || !field.contains(range.endContainer)) return range;

  const start = lettersBefore(field, range.startContainer, range.startOffset);
  const end = start + range.toString().length;
  const offsets = trimInlineSelectionOffsets(
    field.textContent ?? '',
    start,
    end,
  );
  if (!offsets) return;
  // Nothing at its edges: the range as it is, its direction kept.
  if (offsets.start === start && offsets.end === end) return range;

  const next = document.createRange();
  const from = caretAfterLetters(field, offsets.start);
  const to = caretAfterLetters(field, offsets.end);
  next.setStart(from.startContainer, from.startOffset);
  next.setEnd(to.startContainer, to.startOffset);
  return next;
}

/** Trims the current selection in place (see `trimInlineRange`). */
export function trimCurrentInlineSelection(): Range | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const next = trimInlineRange(range);
  if (!next || next === range) return next;
  selectRange(next);
  return next;
}
