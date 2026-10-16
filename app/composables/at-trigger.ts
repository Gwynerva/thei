/**
 * The character beside a point of a field's text, across its nodes: a line
 * break counts as a space, the field's edge as nothing.
 */
function charBeside(
  field: HTMLElement,
  text: Text,
  offset: number,
  forward: boolean,
): string {
  const index = forward ? offset : offset - 1;
  if (index >= 0 && index < text.data.length) return text.data[index]!;
  const walker = document.createTreeWalker(
    field,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) =>
        node.nodeType === Node.TEXT_NODE || (node as Element).localName === 'br'
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    },
  );
  walker.currentNode = text;
  for (
    let node = forward ? walker.nextNode() : walker.previousNode();
    node;
    node = forward ? walker.nextNode() : walker.previousNode()
  ) {
    if (node.nodeType !== Node.TEXT_NODE) return '\n';
    const data = (node as Text).data;
    if (data) return forward ? data[0]! : data[data.length - 1]!;
  }
  return '';
}

/**
 * The `@` just typed into `field`, when it stands alone — a space or the
 * edge of the text on either side of it, never a letter: the range of that
 * one character. However it came — a key, a phone's keyboard, a paste of
 * one character — but not while a word is still being composed.
 */
export function typedAt(event: Event, field: HTMLElement): Range | undefined {
  const input = event as InputEvent;
  if (!input.inputType?.startsWith('insert') || input.isComposing)
    return undefined;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return undefined;
  const caret = selection.getRangeAt(0);
  const node = caret.startContainer;
  if (
    !caret.collapsed ||
    node.nodeType !== Node.TEXT_NODE ||
    !field.contains(node)
  )
    return undefined;
  const text = node as Text;
  const offset = caret.startOffset;
  if (text.data[offset - 1] !== '@') return undefined;
  const before = charBeside(field, text, offset - 1, false);
  const after = charBeside(field, text, offset, true);
  if (/\S/.test(before) || /\S/.test(after)) return undefined;
  const at = document.createRange();
  at.setStart(text, offset - 1);
  at.setEnd(text, offset);
  return at;
}
