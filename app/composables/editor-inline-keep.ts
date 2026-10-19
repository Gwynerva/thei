import {
  announceTyped,
  editableFieldOf,
  insertInlineElement,
  placeCaretAfter,
  runEditCommand,
  selectRange,
  writeBesideElement,
} from '../components/content/editor-edit-commands';
import {
  besideMarkup,
  caretAfterLetters,
  caretAtEdge,
  caretIn,
  insideEdgeAt,
  markupHeldBy,
  nodeAt,
  pathTo,
  placeInRoot,
  rangeOf,
  textsOf,
  typedText,
  typesText,
  wordsBeside,
  type InlineSide,
} from './editor-inline-dom';

/** The mark of an emptied element waiting at the caret. */
const KEPT_CLASS = 'content-inline-kept';

/** The deletions a key makes; a cut or a drag takes words away on purpose. */
const KEY_DELETIONS = new Set([
  'deleteContent',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
]);

/** Keys that move the caret, or end what is typed: whatever was held goes. */
const LEAVING_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Tab',
  'Enter',
  'Escape',
]);

export interface WordsOffer {
  /**
   * Typed over the offered words, text that starts with one of these goes
   * after the element instead: the words are accepted, not replaced.
   */
  acceptedBy: RegExp;
  /** The words are offered no longer. */
  onRelease?: () => void;
}

export interface EditorInlineKeep {
  /**
   * An element's words, selected, offered to be typed over or accepted —
   * the name the "@" gives a link. Escape accepts them too, the caret after
   * the element. The offer lasts while they stay selected.
   */
  offer(element: HTMLElement, offer: WordsOffer): void;
  /**
   * Text put in at the selection as if typed — a paste of a line of words —
   * where these rules would put it; HTML, when given, goes in its place.
   * False when no rule took it, and it is the browser's to put in.
   */
  write(text: string, html?: string): boolean;
  /**
   * An emptied element waits at the caret: the next Backspace or Delete is
   * its own, and no other handler may take it first.
   */
  holdsCaret(): boolean;
  dispose(): void;
}

/** Markup as a chain of empty copies, outermost first, to be put back. */
type Chain = readonly HTMLElement[];

function copies(chain: readonly HTMLElement[]): Chain {
  return chain.map((element) => element.cloneNode(false) as HTMLElement);
}

/** The chain round words, as one element to put in. */
function rebuild(chain: Chain, words: string | DocumentFragment): HTMLElement {
  const [outer, ...inner] = copies(chain);
  let current = outer!;
  for (const element of inner) {
    current.append(element);
    current = element;
  }
  if (typeof words === 'string') current.textContent = words;
  else current.append(words);
  return outer!;
}

/** HTML as nodes, to be put somewhere of its own. */
function fragmentOf(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

/**
 * The browser remembers how the words it deleted looked — bold, a colour —
 * and dresses the next letter in it. The same caret set anew lets it go.
 */
function forgetTypingStyle() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const caret = selection.getRangeAt(0).cloneRange();
  selection.removeAllRanges();
  selection.addRange(caret);
}

/** A place in an element, by its children's places, to find again later. */
type InlinePlace = { path: number[]; offset: number };

/**
 * Where words go against the markup of words — a link, a hint, bold,
 * italic — whether they are typed, composed by a phone's keyboard or pasted.
 * Where the caret stands decides, as the ring round the markup the caret is
 * in shows (`editor-inline-caret.ts`):
 *
 * - inside markup, they go into it, even at an edge where the browser
 *   writes them outside: before markup's first letter, after a link's last;
 * - outside markup, they go outside, even right after a hint or bold, where
 *   the browser would take them into it;
 * - markup outlives its words. Its words typed over whole, the new ones go
 *   in their place, inside it. Its last letters deleted, it waits, empty,
 *   where it was, the caret marked: what is typed there goes back into it,
 *   and one more Backspace or Delete lets it go, deleting nothing else.
 *   Moving the caret away lets it go too. The browser drops an element left
 *   without words, and dresses the next letter in what it remembers of the
 *   words it deleted, colour and all.
 *
 * Where the browser would put the words elsewhere, Thei's editing commands
 * (`editor-edit-commands.ts`) write them, one step of Ctrl+Z each, the
 * element put back with the words in place; elsewhere the browser types.
 * A word being composed cannot be stopped: it is moved where it belongs
 * once it is done. Nothing is written into the text while an element waits
 * empty: its mark is drawn in `root`, outside Editor.js's tree; `root` must
 * be positioned.
 */
export function bindEditorInlineKeep(root: HTMLElement): EditorInlineKeep {
  /** An element emptied by a deletion, waiting at the caret. */
  let kept: { chain: Chain; node: Node; offset: number } | undefined;
  /** An element whose selected words are offered. */
  let offered: (WordsOffer & { element: HTMLElement }) | undefined;
  /** A word being composed where it belongs elsewhere than it goes. */
  let composing:
    | { kind: 'kept'; chain: Chain }
    | { kind: 'whole'; chain: Chain; outer: HTMLElement }
    | {
        kind: 'inside';
        element: HTMLElement;
        /** Where in it the word belongs. */
        at: InlinePlace;
        words: string;
        /** At its first letter, where the browser writes before it. */
        start: boolean;
      }
    | {
        kind: 'beside';
        element: HTMLElement;
        side: InlineSide;
        /** Its words before the word, which it is not to keep. */
        words: string;
      }
    | undefined;
  let marker: HTMLElement | undefined;

  // ---- The element kept empty ------------------------------------------------

  function atKept(range: Range | undefined) {
    return Boolean(
      kept &&
      range?.collapsed &&
      range.startContainer === kept.node &&
      range.startOffset === kept.offset,
    );
  }

  function keep(chain: Chain) {
    const at = caretIn(root, { collapsed: true });
    if (!at) return;
    kept = { chain, node: at.startContainer, offset: at.startOffset };
    mark(at);
  }

  function letGo() {
    kept = undefined;
    marker?.remove();
  }

  /** Where the caret stands, from the line it is on. */
  function caretRect(at: Range): DOMRect | undefined {
    const rect = at.getClientRects()[0];
    if (rect?.height) return rect;
    const field = editableFieldOf(at.startContainer);
    if (!field) return undefined;
    // An empty line has no box of words to measure: the field's first line.
    const box = field.getBoundingClientRect();
    const style = getComputedStyle(field);
    const line =
      Number.parseFloat(style.lineHeight) ||
      Number.parseFloat(style.fontSize) * 1.5;
    return new DOMRect(
      box.left + Number.parseFloat(style.paddingLeft),
      box.top + Number.parseFloat(style.paddingTop),
      0,
      line,
    );
  }

  function mark(at: Range) {
    const rect = caretRect(at);
    if (!rect) return;
    if (!marker) {
      marker = document.createElement('span');
      marker.className = KEPT_CLASS;
      marker.setAttribute('aria-hidden', 'true');
    }
    const { left, top } = placeInRoot(root, rect);
    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
    marker.style.height = `${rect.height}px`;
    if (!marker.isConnected) root.prepend(marker);
  }

  // ---- Writing words in ------------------------------------------------------

  /** Puts words back inside a chain of markup, in place of a range. */
  function putBack(
    range: Range,
    chain: Chain,
    words: string | DocumentFragment,
  ) {
    const placed = insertInlineElement(range, rebuild(chain, words));
    if (!placed) return;
    selectRange(caretAtEdge(placed, 'end'));
  }

  /**
   * Words written inside an element at a place in it, as one step of
   * Ctrl+Z: the element is put back with them, whatever markup it holds, and
   * the caret after them. `replacing` is what it all takes the place of when
   * more than the element: a word the browser wrote beside it.
   */
  function writeAt(
    element: HTMLElement,
    at: InlinePlace,
    words: string | DocumentFragment,
    replacing?: Range,
  ) {
    const here = nodeAt(element, at.path);
    if (!here) return;
    const before = wordsBeside(element, here, at.offset, 'before').length;
    const added =
      typeof words === 'string'
        ? words.length
        : (words.textContent?.length ?? 0);
    const copy = element.cloneNode(true) as HTMLElement;
    const there = nodeAt(copy, at.path)!;
    const nodes =
      typeof words === 'string' ? document.createTextNode(words) : words;
    if (there.nodeType === Node.TEXT_NODE) {
      const after = (there as Text).splitText(at.offset);
      after.before(nodes);
    } else there.insertBefore(nodes, there.childNodes[at.offset] ?? null);
    const whole = replacing ?? document.createRange();
    if (!replacing) whole.selectNode(element);
    const placed = insertInlineElement(whole, copy);
    if (placed) selectRange(caretAfterLetters(placed, before + added));
  }

  /** The place of a caret in an element it stands in. */
  function placeOf(element: HTMLElement, at: Range): InlinePlace | undefined {
    const path = pathTo(element, at.startContainer);
    return path && { path, offset: at.startOffset };
  }

  /**
   * Words put in at the selection where these rules would put them: true
   * when a rule took them in; false when they are the browser's to put in,
   * where it would put them too.
   */
  function writeWords(at: Range, text: string, html?: string): boolean {
    const words = () => (html === undefined ? text : fragmentOf(html));

    // Into the emptied element waiting there.
    if (kept && atKept(at)) {
      const state = kept;
      letGo();
      putBack(at, state.chain, words());
      return true;
    }
    letGo();

    if (at.collapsed) {
      // Inside markup at an edge, where the browser would write outside.
      const inside = insideEdgeAt(at);
      const place = inside && placeOf(inside, at);
      if (inside && place) {
        writeAt(inside, place, words());
        return true;
      }
      // Outside markup right beside it, where the browser would write in.
      const beside = besideMarkup(at);
      if (!beside) return false;
      writeBesideElement(
        beside.element,
        html === undefined ? text : { html },
        beside.side,
      );
      return true;
    }

    // The offered words accepted by what is typed over them.
    const state = offered;
    if (state && html === undefined && offerStands(state)) {
      if (state.acceptedBy.test(text)) {
        release();
        writeBesideElement(state.element, text, 'after');
        return true;
      }
    }
    // Markup's words typed over whole: the new ones go inside it.
    const chain = markupHeldBy(at);
    const outer = chain[0];
    if (!outer) return false;
    const whole = document.createRange();
    whole.selectNode(outer);
    putBack(whole, copies(chain), words());
    return true;
  }

  /**
   * The words right before a collapsed caret, grown over whatever the
   * browser wrapped them in alone — a composed word comes dressed in what it
   * remembered of the words it replaced — and over `emptied`, markup it
   * left empty right before them.
   */
  function wordsBeforeCaret(
    words: string,
    emptied?: HTMLElement,
  ): Range | undefined {
    const at = caretIn(root, { collapsed: true });
    const node = at?.startContainer;
    if (!at || node?.nodeType !== Node.TEXT_NODE) return undefined;
    const offset = at.startOffset;
    if ((node as Text).data.slice(offset - words.length, offset) !== words)
      return undefined;
    const range = document.createRange();
    range.setStart(node, offset - words.length);
    range.setEnd(node, offset);
    const field = editableFieldOf(node);
    let outer: Node = node;
    for (
      let element = node.parentElement;
      element && element !== field && field?.contains(element);
      element = element.parentElement
    ) {
      if (element.textContent !== words) break;
      outer = element;
      range.selectNode(element);
    }
    if (
      emptied?.isConnected &&
      !emptied.textContent &&
      emptied.nextSibling === outer &&
      range.startOffset === 0
    )
      range.setStartBefore(emptied);
    return range;
  }

  // ---- The words offered -----------------------------------------------------

  function offer(element: HTMLElement, options: WordsOffer) {
    if (offered && offered.element !== element) release();
    offered = { ...options, element };
  }

  function release() {
    const state = offered;
    offered = undefined;
    state?.onRelease?.();
  }

  /** Whether the offered element's words are what is selected. */
  function offerStands(state: NonNullable<typeof offered>) {
    const range = caretIn(root);
    const words = state.element.textContent ?? '';
    return Boolean(
      state.element.isConnected &&
      range &&
      !range.collapsed &&
      words &&
      range.toString() === words &&
      range.intersectsNode(state.element),
    );
  }

  // ---- Events ------------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    // The last Backspace or Delete lets the emptied element go — before
    // Editor.js takes it at the edge of a block to join it to the next.
    if (
      kept &&
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.altKey &&
      atKept(caretIn(root))
    ) {
      event.preventDefault();
      event.stopPropagation();
      letGo();
      return;
    }
    if (!LEAVING_KEYS.has(event.key)) return;
    letGo();
    const state = offered;
    if (!state) return;
    release();
    if (event.key === 'Escape' && offerStands(state)) {
      // Accepted: what is typed next follows the element.
      event.preventDefault();
      event.stopPropagation();
      placeCaretAfter(state.element);
    }
  }

  function onBeforeInput(event: InputEvent) {
    if (event.defaultPrevented) return;
    const type = event.inputType;
    // A word being composed cannot be stopped; it is moved once done.
    if (type === 'insertCompositionText') return;
    const at = caretIn(root);
    if (!at || !event.cancelable) {
      letGo();
      return;
    }

    // The last deletion of an emptied element: it goes, and nothing else.
    if (kept && atKept(at) && KEY_DELETIONS.has(type)) {
      event.preventDefault();
      letGo();
      return;
    }

    const text = typedText(event);
    if (typesText(event)) {
      // A caret is read as the selection holds it — where the ring says it
      // is — not as the browser's target, which it has already moved to
      // where it would type; words replaced are what the target names.
      const target = event.getTargetRanges()[0];
      const range = target && !target.collapsed ? rangeOf(target) : at;
      if (text && writeWords(range, text)) {
        event.preventDefault();
        announceTyped();
      }
      return;
    }
    letGo();

    if (!KEY_DELETIONS.has(type)) return;
    const target = event.getTargetRanges()[0];
    if (!target || target.collapsed) return;
    const range = rangeOf(target);
    if (!root.contains(range.commonAncestorContainer)) return;
    const chain = markupHeldBy(range);
    const outer = chain[0];
    if (!outer) return;
    // Its last letters deleted: it waits, empty, for what comes next.
    event.preventDefault();
    const templates = copies(chain);
    const whole = document.createRange();
    whole.selectNode(outer);
    editableFieldOf(outer)?.focus({ preventScroll: true });
    selectRange(whole);
    // Refused: the same change by hand, outside the browser's history.
    if (!runEditCommand('delete')) {
      whole.deleteContents();
      selectRange(whole);
    }
    forgetTypingStyle();
    keep(templates);
  }

  function onCompositionStart() {
    const at = caretIn(root);
    composing = undefined;
    if (!at) return;
    if (kept && atKept(at)) {
      composing = { kind: 'kept', chain: kept.chain };
      letGo();
      return;
    }
    if (!at.collapsed) {
      const chain = markupHeldBy(at);
      if (chain[0])
        composing = { kind: 'whole', chain: copies(chain), outer: chain[0] };
      return;
    }
    const inside = insideEdgeAt(at);
    const place = inside && placeOf(inside, at);
    if (inside && place) {
      composing = {
        kind: 'inside',
        element: inside,
        at: place,
        words: inside.textContent ?? '',
        start:
          wordsBeside(inside, at.startContainer, at.startOffset, 'before') ===
          '',
      };
      return;
    }
    const beside = besideMarkup(at);
    if (beside)
      composing = {
        kind: 'beside',
        ...beside,
        words: beside.element.textContent ?? '',
      };
  }

  function onCompositionEnd(event: CompositionEvent) {
    const state = composing;
    composing = undefined;
    const data = event.data;
    if (!state || !data) return;
    if (state.kind === 'inside') composedInside(state, data);
    else if (state.kind === 'beside') composedBeside(state, data);
    else composedOver(state, data);
  }

  /** A word composed at an edge inside markup, written beside it: taken in. */
  function composedInside(
    state: Extract<typeof composing, { kind: 'inside' }>,
    data: string,
  ) {
    const { element } = state;
    // Composed into it after all, or gone meanwhile.
    if (!element.isConnected || element.textContent !== state.words) return;
    const beside = state.start ? element.previousSibling : element.nextSibling;
    if (beside?.nodeType !== Node.TEXT_NODE) return;
    const text = beside as Text;
    const range = document.createRange();
    if (state.start) {
      if (!text.data.endsWith(data)) return;
      range.setStart(text, text.length - data.length);
      range.setEndAfter(element);
    } else {
      if (!text.data.startsWith(data)) return;
      range.setStartBefore(element);
      range.setEnd(text, data.length);
    }
    writeAt(element, state.at, data, range);
  }

  /** A word composed right beside markup, taken into it: moved out. */
  function composedBeside(
    state: Extract<typeof composing, { kind: 'beside' }>,
    data: string,
  ) {
    const { element, side } = state;
    if (!element.isConnected) return;
    // Moved out only if the markup grew by the very word: a keyboard that
    // composed again over words already there is left as it wrote them.
    const words = element.textContent ?? '';
    if (words !== (side === 'after' ? state.words + data : data + state.words))
      return;
    // The element as it was, and the word beside it.
    const before = element.cloneNode(true) as HTMLElement;
    const texts = textsOf(before);
    const edge = side === 'after' ? texts.at(-1) : texts[0];
    if (!edge) return;
    if (side === 'after') {
      if (!edge.data.endsWith(data)) return;
      edge.data = edge.data.slice(0, -data.length);
    } else {
      if (!edge.data.startsWith(data)) return;
      edge.data = edge.data.slice(data.length);
    }
    writeBesideElement(element, data, side, before);
  }

  /** A word composed into an emptied element, or over markup's words. */
  function composedOver(
    state: Extract<typeof composing, { kind: 'kept' | 'whole' }>,
    data: string,
  ) {
    if (state.kind === 'whole' && state.outer.isConnected) {
      const { outer } = state;
      const inside = outer.textContent ?? '';
      // Kept by the browser and typed into, as wanted.
      if (inside === data) return;
      if (inside) {
        // Begun inside, and the rest after it, where the browser keeps
        // clear of a link's end: taken in.
        const rest = data.slice(inside.length);
        const after = outer.nextSibling;
        if (
          !data.startsWith(inside) ||
          after?.nodeType !== Node.TEXT_NODE ||
          !(after as Text).data.startsWith(rest)
        )
          return;
        const range = document.createRange();
        range.setStartBefore(outer);
        range.setEnd(after, rest.length);
        putBack(range, state.chain, data);
        return;
      }
    }
    // Taken away with its words, or never there: put back round the word.
    const range = wordsBeforeCaret(
      data,
      state.kind === 'whole' ? state.outer : undefined,
    );
    if (range) putBack(range, state.chain, data);
  }

  function onSelectionChange() {
    // While a word is composed the caret moves with it: it is looked at once
    // the word is done.
    if (composing) return;
    if (kept && !atKept(caretIn(root))) letGo();
    if (offered && !offerStands(offered)) release();
  }

  function onLeave() {
    letGo();
    release();
  }

  function write(text: string, html?: string) {
    const at = caretIn(root);
    if (!at || !writeWords(at, text, html)) return false;
    announceTyped();
    return true;
  }

  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('beforeinput', onBeforeInput, true);
  root.addEventListener('compositionstart', onCompositionStart, true);
  root.addEventListener('compositionend', onCompositionEnd, true);
  root.addEventListener('pointerdown', onLeave, true);
  root.addEventListener('focusout', onLeave);
  document.addEventListener('selectionchange', onSelectionChange);

  return {
    offer,
    write,
    holdsCaret: () => atKept(caretIn(root)),
    dispose() {
      root.removeEventListener('keydown', onKeyDown, true);
      root.removeEventListener('beforeinput', onBeforeInput, true);
      root.removeEventListener('compositionstart', onCompositionStart, true);
      root.removeEventListener('compositionend', onCompositionEnd, true);
      root.removeEventListener('pointerdown', onLeave, true);
      root.removeEventListener('focusout', onLeave);
      document.removeEventListener('selectionchange', onSelectionChange);
      onLeave();
      marker = undefined;
    },
  };
}
