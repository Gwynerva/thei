/** A piece of a snippet; `mark` on the words that were found. */
export interface SearchSegment {
  text: string;
  mark?: true;
}

/** How long a snippet runs, in characters, around what was found. */
export const SEARCH_SNIPPET_LENGTH = 160;
/**
 * How far before the first find a snippet opens: a few words, so the find
 * stands near the start of a line cut short — a card's two lines on a phone,
 * a quick search's one.
 */
export const SEARCH_SNIPPET_LEAD = 24;

interface Span {
  start: number;
  end: number;
}

/**
 * The part of a text around what was found, as segments with the found words
 * marked. The window opens a little before the first find and is cut at
 * spaces; an ellipsis says where the text goes on. A text short enough is
 * given whole.
 */
export function snippetSegments(
  text: string,
  hits: readonly Span[],
  length = SEARCH_SNIPPET_LENGTH,
  lead = SEARCH_SNIPPET_LEAD,
): SearchSegment[] {
  // A line break reads as a space; one for one, so the places stay true.
  const flat = text.replace(/\s/gu, ' ');
  if (!hits.length) return cut(flat, 0, Math.min(flat.length, length), []);
  const first = hits[0]!;
  let start = 0;
  let end = flat.length;
  if (flat.length > length) {
    start = Math.max(0, first.start - Math.min(lead, Math.floor(length / 3)));
    end = Math.min(flat.length, start + length);
    if (end - start < length) start = Math.max(0, end - length);
    if (start > 0) {
      const space = flat.indexOf(' ', start);
      if (space !== -1 && space < first.start) start = space + 1;
    }
    if (end < flat.length) {
      const space = flat.lastIndexOf(' ', end);
      if (space > first.end) end = space;
    }
  }
  return cut(flat, start, end, hits);
}

function cut(
  text: string,
  start: number,
  end: number,
  hits: readonly Span[],
): SearchSegment[] {
  const segments: SearchSegment[] = [];
  if (start > 0) segments.push({ text: '…' });
  let at = start;
  for (const hit of [...hits].sort((a, b) => a.start - b.start)) {
    if (hit.start < at || hit.end > end) continue;
    if (hit.start > at) segments.push({ text: text.slice(at, hit.start) });
    segments.push({ text: text.slice(hit.start, hit.end), mark: true });
    at = hit.end;
  }
  if (at < end) segments.push({ text: text.slice(at, end) });
  if (end < text.length) segments.push({ text: '…' });
  return segments;
}
