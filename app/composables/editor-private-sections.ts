import type EditorJS from '@editorjs/editorjs';
import type { BlockMutationEvent } from '@editorjs/editorjs';
import { EDITOR_SELECTED_BLOCK_SELECTOR, editorBlockOf } from './editor-dom';
import { wordsBeside } from './editor-inline-dom';

/**
 * The private sections of a text in the editor.
 *
 * A section is two blocks of its own, its edges, which share a `sectionId`;
 * everything between them is private. Editor.js knows nothing of the pair:
 * it moves, deletes, copies and pastes each edge as a block like any other.
 * This keeps the pairs whole as it does, judged on the batches of changes it
 * reports:
 *
 * - a move that would put a section inside or across another, or turn one
 *   inside out, is put back — on a drag it never starts;
 * - an edge removed takes its own partner with it, and keeps the blocks;
 * - a section left with nothing between its edges goes, unless it was made
 *   in this sitting and has not been written in yet;
 * - pasted edges become a section of their own, or go when they came alone
 *   or landed inside another section.
 *
 * Leaving a block private that was meant to be is harmless; making public a
 * block that was private is the one thing that must never happen by itself.
 * So the keyboard never takes an edge away: Backspace and Delete step over
 * one, and keys over selected blocks leave the edges of a section they only
 * partly cover (`root`). A section's privacy goes from its edge's own menu.
 */

export type EditorPrivateSectionEdge = 'start' | 'end';

export interface EditorPrivateSectionBlock {
  id: string;
  sectionId?: string;
  /**
   * The edge the boundary stood for when the layout last settled; none for a
   * boundary that came since.
   */
  edge?: EditorPrivateSectionEdge;
}

export interface EditorPrivateSectionRange {
  sectionId: string;
  /** Index of the opening edge. */
  start: number;
  /** Index of the closing edge. */
  end: number;
}

/**
 * The sections of a layout, in order: every id two boundaries carry, from the
 * first of them to the second.
 *
 * A boundary whose id is on one block or on three is a stray, read as a
 * plain block. Within one batch of Editor.js changes a section can be half
 * there — a new one waits for its end, a removed one for the removal of its
 * partner — and neither says anything about the rest of the layout.
 */
export function editorPrivateSectionRanges(
  blocks: readonly EditorPrivateSectionBlock[],
): EditorPrivateSectionRange[] {
  const boundaries = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (!block.sectionId) return;
    const indices = boundaries.get(block.sectionId) ?? [];
    indices.push(index);
    boundaries.set(block.sectionId, indices);
  });
  return Array.from(boundaries)
    .filter(([, indices]) => indices.length === 2)
    .map(([sectionId, [start, end]]) => ({
      sectionId,
      start: start!,
      end: end!,
    }))
    .sort((left, right) => left.start - right.start);
}

/**
 * Whether the sections of a layout can stand: none inside or across another,
 * and none turned inside out. An edge that settled as a section's start still
 * opens it, so a move never hands the privacy of a section's blocks over to
 * the blocks around it.
 */
export function editorPrivateSectionLayoutIsValid(
  blocks: readonly EditorPrivateSectionBlock[],
) {
  let previousEnd = -1;
  for (const range of editorPrivateSectionRanges(blocks)) {
    if (range.start <= previousEnd) return false;
    if (blocks[range.start]!.edge === 'end') return false;
    if (blocks[range.end]!.edge === 'start') return false;
    previousEnd = range.end;
  }
  return true;
}

export function editorPrivateSectionMoveIsValid(
  blocks: readonly EditorPrivateSectionBlock[],
  sourceIndex: number,
  targetIndex: number,
) {
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= blocks.length ||
    targetIndex >= blocks.length
  )
    return false;
  const moved = [...blocks];
  const [source] = moved.splice(sourceIndex, 1);
  if (!source) return false;
  moved.splice(targetIndex, 0, source);
  return editorPrivateSectionLayoutIsValid(moved);
}

/**
 * What becomes of boundaries that came in without being made as a pair: the
 * ones a paste brings, which carry the id of the section they were copied
 * from.
 *
 * - Both edges of one section, clear of every other: a section of its own,
 *   under a new id (`pairs`), so it never shares one with its original.
 * - Both, but inside or across another section: dropped, and their blocks
 *   stay where they landed, in that section. Sections do not nest.
 * - An edge that came without its partner: dropped.
 */
export function editorPrivateSectionArrivals(
  blocks: readonly EditorPrivateSectionBlock[],
  arrived: ReadonlySet<string>,
): { pairs: [start: string, end: string][]; dropped: string[] } {
  const taken = editorPrivateSectionRanges(
    blocks.map((block) => (arrived.has(block.id) ? { id: block.id } : block)),
  );
  const groups = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (!block.sectionId || !arrived.has(block.id)) return;
    const indices = groups.get(block.sectionId) ?? [];
    indices.push(index);
    groups.set(block.sectionId, indices);
  });

  const pairs: [string, string][] = [];
  const dropped: string[] = [];
  const candidates = Array.from(groups.values()).sort(
    (left, right) => left[0]! - right[0]!,
  );
  for (const indices of candidates) {
    const [start, end] = indices;
    const clear =
      indices.length === 2 &&
      taken.every((range) => range.end < start! || range.start > end!);
    if (!clear) {
      dropped.push(...indices.map((index) => blocks[index]!.id));
      continue;
    }
    pairs.push([blocks[start!]!.id, blocks[end!]!.id]);
    taken.push({ sectionId: '', start: start!, end: end! });
  }
  return { pairs, dropped };
}

/**
 * The selected boundaries a key over selected blocks must leave in place:
 * every one whose partner is not selected with it. A section selected whole
 * goes whole, with its blocks; one selected in part keeps its edges, so the
 * blocks it keeps stay private.
 */
export function editorPrivateSectionEdgesToKeep(
  blocks: readonly EditorPrivateSectionBlock[],
  selected: ReadonlySet<string>,
): string[] {
  const whole = new Set<string>();
  for (const range of editorPrivateSectionRanges(blocks)) {
    const start = blocks[range.start]!.id;
    const end = blocks[range.end]!.id;
    if (selected.has(start) && selected.has(end)) {
      whole.add(start);
      whole.add(end);
    }
  }
  return blocks
    .filter(
      (block) =>
        block.sectionId && selected.has(block.id) && !whole.has(block.id),
    )
    .map((block) => block.id);
}

/** The nearest block from `index` on, in `step`'s direction, that is not an edge. */
export function editorPrivateSectionStepOver(
  blocks: readonly EditorPrivateSectionBlock[],
  index: number,
  step: 1 | -1,
): number | undefined {
  for (let at = index; at >= 0 && at < blocks.length; at += step)
    if (!blocks[at]!.sectionId) return at;
  return undefined;
}

/**
 * A key Editor.js counts as typing a character, by its old `keyCode`: a
 * digit, a letter, the space, the numpad, punctuation, or an input method's.
 */
function printableKeyCode(keyCode: number) {
  return (
    (keyCode > 47 && keyCode < 58) ||
    keyCode === 32 ||
    keyCode === 229 ||
    (keyCode > 64 && keyCode < 91) ||
    (keyCode > 95 && keyCode < 112) ||
    (keyCode > 185 && keyCode < 193) ||
    (keyCode > 218 && keyCode < 223)
  );
}

/** Editor.js's own fields of a block, as it finds them. */
const FIELD_SELECTOR = [
  '[contenteditable="true"]',
  'textarea',
  'input:not([type])',
  ...['text', 'password', 'email', 'number', 'search', 'tel', 'url'].map(
    (type) => `input[type="${type}"]`,
  ),
].join(', ');

export interface EditorPrivateSectionsOptions {
  suppressionDuration?: number;
  /**
   * The editor's holder. Given, the keyboard is kept off the edges of
   * sections; without it the edges are kept only as blocks change.
   */
  root?: HTMLElement;
  /**
   * Whether a key is someone else's before an edge is thought of: the last
   * Backspace or Delete of emptied markup (`editor-inline-keep.ts`), which
   * lets the markup go and moves nothing. This hears every key first.
   */
  keyTaken?: () => boolean;
}

export function createEditorPrivateSections(
  editor: EditorJS,
  options: EditorPrivateSectionsOptions = {},
) {
  const suppressionDuration = options.suppressionDuration ?? 1000;
  const root = options.root;
  const ignoredAddedIds = new Set<string>();
  const ignoredRemovedIds = new Set<string>();
  const ignoredMovedIds = new Set<string>();
  let suppressionTimer: ReturnType<typeof setTimeout> | undefined;
  function resetSuppression() {
    clearTimeout(suppressionTimer);
    suppressionTimer = undefined;
    ignoredAddedIds.clear();
    ignoredRemovedIds.clear();
    ignoredMovedIds.clear();
  }
  function suppress(set: Set<string>, id: string) {
    set.add(id);
    clearTimeout(suppressionTimer);
    // Editor.js batches mutations for 400ms. Never retain a guard indefinitely
    // when an operation produces no observable follow-up event.
    suppressionTimer = setTimeout(resetSuppression, suppressionDuration);
  }
  /**
   * Each edge of a section as the layout last settled: its section, which
   * edge it is, and its partner. A removed edge takes this partner, never
   * just any block that carries its id.
   */
  let settled = new Map<
    string,
    { sectionId: string; edge: EditorPrivateSectionEdge; partner: string }
  >();
  /**
   * The order of the blocks when the layout was last valid: where a block an
   * invalid move took away goes back to. Editor.js batches its change events
   * and keeps only the latest move of each block, with indexes the rest of the
   * batch may have shifted, so the events themselves cannot say where it was.
   */
  let settledOrder: string[] = [];
  /**
   * Sections made in this sitting. One stays when it is left empty, as it is
   * when it is made, so that it can still be written in; the stored text has
   * no empty section either way.
   */
  const madeHere = new Set<string>();
  /** Moves told while the editor was taking a whole text in. */
  let heldMoves: BlockMutationEvent[] = [];

  function boundaryFromBlock(block: ReturnType<typeof blockAt>) {
    if (!block) return undefined;
    const element = block.holder.querySelector<HTMLElement>(
      '[data-private-section-id]',
    );
    const sectionId = element?.dataset.privateSectionId;
    if (sectionId) {
      return {
        sectionId,
        edge:
          element.dataset.privateSectionEdge === 'end'
            ? ('end' as const)
            : ('start' as const),
        element,
      };
    }
    const remembered = settled.get(block.id);
    return remembered ? { ...remembered, element: undefined } : undefined;
  }

  function blockAt(index: number) {
    return editor.blocks.getBlockByIndex(index);
  }

  function blocks() {
    return Array.from({ length: editor.blocks.getBlocksCount() }, (_, index) =>
      blockAt(index),
    ).filter((block) => block !== undefined);
  }

  function layoutOf(
    current: ReturnType<typeof blocks>,
  ): EditorPrivateSectionBlock[] {
    return current.map((block) => {
      const sectionId = boundaryFromBlock(block)?.sectionId;
      const edge = sectionId ? settled.get(block.id)?.edge : undefined;
      return { id: block.id, sectionId, ...(edge ? { edge } : {}) };
    });
  }

  function descriptors() {
    return layoutOf(blocks());
  }

  function canMove(sourceIndex: number, targetIndex: number) {
    return editorPrivateSectionMoveIsValid(
      descriptors(),
      sourceIndex,
      targetIndex,
    );
  }

  /** The block holder a node of the text is in: a caret stands in a text node. */
  function holderOf(node: Node) {
    return editorBlockOf(
      root!,
      node instanceof Element ? node : node.parentElement,
    );
  }

  function selectedHolder(holder: HTMLElement) {
    return holder.classList?.contains(EDITOR_SELECTED_BLOCK_SELECTOR.slice(1));
  }

  /**
   * Runs a change that deletes blocks through Editor.js's API, which puts the
   * caret at the end of the block before each one deleted, and selects that
   * block when it has no text — an edge, say, which the next key typed would
   * then replace. The caret goes back where it was; an edge it selected is
   * let go.
   */
  function keepingCaret(change: () => void) {
    const selection = globalThis.getSelection?.();
    const range =
      selection?.rangeCount && root?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : undefined;
    const selectedBefore = new Set(
      blocks()
        .filter((block) => selectedHolder(block.holder))
        .map((block) => block.id),
    );
    change();
    for (const block of blocks()) {
      if (selectedBefore.has(block.id) || !selectedHolder(block.holder))
        continue;
      if (boundaryFromBlock(block))
        block.holder.classList.remove(EDITOR_SELECTED_BLOCK_SELECTOR.slice(1));
    }
    if (!range || !selection || !range.startContainer.isConnected) return;
    const holder = holderOf(range.startContainer);
    const block = holder ? editor.blocks.getBlockByElement(holder) : undefined;
    if (!block || !holder!.querySelector(FIELD_SELECTOR)) return;
    // The block is made current again, then the caret put back to the letter.
    editor.caret.setToBlock(block, 'start');
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function deleteBlocks(ids: readonly string[]) {
    if (!ids.length) return;
    keepingCaret(() => {
      const indices = ids
        .map((id) => editor.blocks.getBlockIndex(id))
        .filter((index) => index !== undefined && index >= 0)
        .sort((left, right) => right - left);
      for (const index of indices) {
        const block = blockAt(index);
        if (block) suppress(ignoredRemovedIds, block.id);
        editor.blocks.delete(index);
      }
    });
  }

  function refresh() {
    const currentBlocks = blocks();
    const layout = layoutOf(currentBlocks);
    const ranges = editorPrivateSectionRanges(layout);
    const next = new Map<
      string,
      { sectionId: string; edge: EditorPrivateSectionEdge; partner: string }
    >();

    const desired = new Map(
      currentBlocks.map((block) => [block.id, {} as Record<string, string>]),
    );

    for (const { sectionId, start, end } of ranges) {
      const edges = [
        [start, end, 'start'],
        [end, start, 'end'],
      ] as const;
      for (const [index, partner, edge] of edges) {
        const block = currentBlocks[index]!;
        next.set(block.id, {
          sectionId,
          edge,
          partner: currentBlocks[partner]!.id,
        });
        desired.get(block.id)!.privateSectionEdge = edge;
        const element = block.holder.querySelector<HTMLElement>(
          '[data-private-section-id]',
        );
        if (!element) continue;
        // The tool saves the edge it is told here: the one its place makes.
        if (element.dataset.privateSectionEdge !== edge)
          element.dataset.privateSectionEdge = edge;
        const label = element.querySelector<HTMLElement>(
          '.content-private-bracket__label span',
        );
        if (label) {
          const text =
            edge === 'start'
              ? (element.dataset.privateSectionStartLabel ?? '')
              : (element.dataset.privateSectionEndLabel ?? '');
          if (label.textContent !== text) label.textContent = text;
        }
      }

      for (let index = start + 1; index < end; index++) {
        const block = currentBlocks[index];
        if (!block) continue;
        desired.get(block.id)!.privateSectionMember = 'true';
      }
    }
    for (const block of currentBlocks) {
      for (const key of ['privateSectionMember', 'privateSectionEdge']) {
        const value = desired.get(block.id)![key];
        if (block.holder.dataset[key] === value) continue;
        if (value === undefined) delete block.holder.dataset[key];
        else block.holder.dataset[key] = value;
      }
    }

    // Judged without the edges as they were: the layout a whole text brings
    // in may turn them all around, and moves are judged before this.
    const unsettled = layout.map(({ id, sectionId }) => ({ id, sectionId }));
    if (editorPrivateSectionLayoutIsValid(unsettled)) {
      settled = next;
      settledOrder = layout.map((block) => block.id);
    }
  }

  /**
   * Puts the blocks an invalid batch of moves took away back after the block
   * that stood before each of them in the settled order, earliest first, so
   * a block restored first can be the place of the next.
   */
  function restoreMoved(movedIds: readonly string[]) {
    const settledIndex = new Map(settledOrder.map((id, index) => [id, index]));
    const restored = movedIds
      .filter((id) => settledIndex.has(id))
      .sort(
        (left, right) => settledIndex.get(left)! - settledIndex.get(right)!,
      );
    for (const id of restored) {
      const current = new Map(
        blocks().map((block, index) => [block.id, index]),
      );
      const from = current.get(id);
      if (from === undefined) continue;
      let after = -1;
      for (let index = settledIndex.get(id)! - 1; index >= 0; index--) {
        const anchor = current.get(settledOrder[index]!);
        if (anchor === undefined) continue;
        after = anchor;
        break;
      }
      // Taking the block out first shifts everything after it up by one.
      const to = from < after ? after : after + 1;
      if (to === from) continue;
      suppress(ignoredMovedIds, id);
      editor.blocks.move(to, from);
    }
  }

  /**
   * Pasted edges: a pair becomes a section of its own under a new id, and
   * the rest go (`editorPrivateSectionArrivals`). Editor.js selects each
   * pasted block that has no text as it puts it in; an edge left selected is
   * let go, so that the next key does not replace it.
   */
  function settleArrivals(arrived: ReadonlySet<string>) {
    if (!arrived.size) return;
    const current = blocks();
    const present = new Set(current.map((block) => block.id));
    const { pairs, dropped } = editorPrivateSectionArrivals(
      layoutOf(current),
      new Set([...arrived].filter((id) => present.has(id))),
    );
    for (const pair of pairs) {
      const sectionId = `private-section-${crypto.randomUUID()}`;
      for (const id of pair) {
        const element = editor.blocks
          .getById(id)
          ?.holder.querySelector<HTMLElement>('[data-private-section-id]');
        if (element) element.dataset.privateSectionId = sectionId;
      }
    }
    deleteBlocks(dropped);
    for (const block of blocks())
      if (arrived.has(block.id) && selectedHolder(block.holder))
        block.holder.classList.remove(EDITOR_SELECTED_BLOCK_SELECTOR.slice(1));
  }

  /** Each removed edge takes its settled partner along, if that is still there. */
  function removePartners(removedIds: readonly string[]) {
    const removed = new Set(removedIds);
    const present = new Set(blocks().map((block) => block.id));
    const partners: string[] = [];
    for (const id of removedIds) {
      const partner = settled.get(id)?.partner;
      if (!partner || removed.has(partner) || !present.has(partner)) continue;
      removed.add(partner);
      partners.push(partner);
    }
    deleteBlocks(partners);
  }

  /**
   * A section with nothing between its edges goes, both edges at once. It
   * can only have been emptied — by a move or a removal — since a section
   * comes into the editor with blocks in it, or is made with an empty line.
   */
  function removeEmptySections() {
    const current = blocks();
    const empty = editorPrivateSectionRanges(layoutOf(current)).filter(
      (range) =>
        range.end === range.start + 1 && !madeHere.has(range.sectionId),
    );
    deleteBlocks(
      empty.flatMap((range) => [
        current[range.start]!.id,
        current[range.end]!.id,
      ]),
    );
  }

  function handleChange(
    value: BlockMutationEvent | BlockMutationEvent[],
  ): boolean {
    const events = [...heldMoves, ...(Array.isArray(value) ? value : [value])];
    heldMoves = [];
    let persistentChange = false;

    // Moves first, together: the layout they left is judged before anything
    // else in the batch reacts to it, and an invalid one is put back before a
    // section added in the same batch is placed against it.
    const movedIds: string[] = [];
    for (const event of events) {
      if (event.type !== 'block-moved') continue;
      const { id } = event.detail.target;
      if (!ignoredMovedIds.delete(id)) movedIds.push(id);
    }
    if (movedIds.length > 0) {
      if (editorPrivateSectionLayoutIsValid(descriptors()))
        persistentChange = true;
      else restoreMoved(movedIds);
    }

    const arrived = new Set<string>();
    const removedEdges: string[] = [];
    for (const event of events) {
      if (event.type === 'block-moved') continue;
      const target = event.detail.target;
      if (event.type === 'block-added') {
        if (ignoredAddedIds.delete(target.id)) continue;
        persistentChange = true;
        const boundary = boundaryFromBlock(target);
        if (!boundary) continue;
        const createPair = target.holder.querySelector<HTMLElement>(
          '[data-private-section-create-pair="true"]',
        );
        if (!createPair) {
          arrived.add(target.id);
          continue;
        }
        createPair.removeAttribute('data-private-section-create-pair');
        const index = editor.blocks.getBlockIndex(target.id);
        const withCounterpart = descriptors();
        withCounterpart.splice(index + 1, 0, {
          id: `${target.id}-counterpart`,
          sectionId: boundary.sectionId,
        });
        if (!editorPrivateSectionLayoutIsValid(withCounterpart)) {
          suppress(ignoredRemovedIds, target.id);
          editor.blocks.delete(index);
          continue;
        }
        madeHere.add(boundary.sectionId);
        const endBoundary = editor.blocks.insert(
          'privateSectionBoundary',
          { sectionId: boundary.sectionId, edge: 'end' },
          undefined,
          index + 1,
        );
        suppress(ignoredAddedIds, endBoundary.id);
        const emptyBlock = editor.blocks.insert(
          'paragraph',
          {},
          undefined,
          index + 1,
          true,
        );
        suppress(ignoredAddedIds, emptyBlock.id);
        editor.caret.setToBlock(emptyBlock, 'start');
        continue;
      }

      if (event.type === 'block-removed') {
        if (ignoredRemovedIds.delete(target.id)) continue;
        persistentChange = true;
        if (boundaryFromBlock(target)) removedEdges.push(target.id);
        continue;
      }

      // Boundary UI is decorative; persisted boundaries change structurally.
      if (!boundaryFromBlock(target)) persistentChange = true;
    }

    settleArrivals(arrived);
    removePartners(removedEdges);
    removeEmptySections();
    refresh();
    return persistentChange;
  }

  /**
   * Keeps the moves Editor.js tells while the editor takes a whole text in,
   * to be judged with the next batch (`handleChange`) or at `releaseMoves`:
   * the rest of what it tells then is the text coming in, already checked.
   */
  function holdMoves(value: BlockMutationEvent | BlockMutationEvent[]) {
    for (const event of Array.isArray(value) ? value : [value])
      if (event.type === 'block-moved') heldMoves.push(event);
  }

  /** Judges the moves held while a text came in; true if one stays. */
  function releaseMoves() {
    return heldMoves.length > 0 && handleChange([]);
  }

  // ---- The keyboard ------------------------------------------------------

  function selectedBlocks() {
    return blocks().filter((block) => selectedHolder(block.holder));
  }

  /**
   * The caret into the nearest block past the edges after `index`, going
   * `step`'s way: at its end going back, at its start going on. False when
   * there is none.
   */
  function caretPast(index: number, step: 1 | -1) {
    const target = editorPrivateSectionStepOver(
      descriptors(),
      index + step,
      step,
    );
    const block = target === undefined ? undefined : blockAt(target);
    if (!block) return false;
    editor.caret.setToBlock(block, step === -1 ? 'end' : 'start');
    return true;
  }

  /**
   * A key over selected blocks that Editor.js takes as removing them:
   * Backspace, Delete, or a character typed over them, told as it tells one.
   * Enter adds a paragraph after them instead (`editor-current-block.ts`).
   */
  function removesSelection(event: KeyboardEvent) {
    if (event.key === 'Backspace' || event.key === 'Delete') return true;
    if (event.key === 'Enter') return false;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return false;
    return event.key.length === 1 || printableKeyCode(event.keyCode);
  }

  /**
   * Deselects the edges of sections the selection covers only in part, so
   * that Editor.js removes or cuts the rest. True when nothing else is
   * selected: then nothing may go at all.
   */
  function letGoOfEdges(selected: ReturnType<typeof blocks>) {
    const keep = new Set(
      editorPrivateSectionEdgesToKeep(
        descriptors(),
        new Set(selected.map((block) => block.id)),
      ),
    );
    if (!keep.size) return false;
    if (keep.size === selected.length) return true;
    for (const block of selected)
      if (keep.has(block.id))
        block.holder.classList.remove(EDITOR_SELECTED_BLOCK_SELECTOR.slice(1));
    return false;
  }

  function reachesEditor(target: EventTarget | null) {
    if (!(target instanceof Node) || !root) return false;
    // A selected block takes the caret out of every field, and the keys
    // typed then come from wherever the focus was left.
    return (
      root.contains(target) ||
      target === document.body ||
      target === document.documentElement
    );
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
      return;
    if (!reachesEditor(event.target)) return;
    const selected = selectedBlocks();
    if (selected.length && removesSelection(event) && letGoOfEdges(selected)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // The selection goes, and the caret to the block beside it: before it
      // for Backspace, after it for Delete, or the other side at an end.
      const first = editor.blocks.getBlockIndex(selected[0]!.id);
      const last = editor.blocks.getBlockIndex(selected.at(-1)!.id);
      if (event.key === 'Backspace')
        void (caretPast(first, -1) || caretPast(last, 1));
      else if (event.key === 'Delete')
        void (caretPast(last, 1) || caretPast(first, -1));
      return;
    }
    if (options.keyTaken?.()) return;
    if (event.key === 'Backspace') stepOverEdge(event, -1);
    else if (event.key === 'Delete') stepOverEdge(event, 1);
  }

  /**
   * Backspace at the start of a block, or Delete at its end, with an edge on
   * that side: Editor.js would select the edge, and the next key would remove
   * it. The caret goes on past it instead, and nothing is removed. So too
   * when blocks are selected and a caret was left in a field, as Shift and
   * the arrows can leave one: Editor.js then acts on the caret, selects the
   * edge in place of the blocks, and removes it at once.
   */
  function stepOverEdge(event: KeyboardEvent, step: 1 | -1) {
    const place = caretPlace();
    if (!place) return;
    const index = editor.blocks.getBlockIndex(place.block.id);
    if (index === undefined || index < 0) return;
    if (!boundaryFromBlock(blockAt(index + step))) return;
    const fields = Array.from(
      place.block.holder.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
    ).filter((field) => !field.querySelector(FIELD_SELECTOR));
    const edgeField = step === -1 ? fields[0] : fields.at(-1);
    if (!edgeField || !edgeField.contains(place.node)) return;
    if (!place.atEdge(edgeField, step)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // With no block past the edge, the caret stays where it is.
    caretPast(index, step);
  }

  /** Where a collapsed caret stands in the editor, and how to tell its edges. */
  function caretPlace() {
    const active = document.activeElement;
    if (
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement) &&
      root!.contains(active)
    ) {
      if (active.selectionStart !== active.selectionEnd) return undefined;
      const holder = editorBlockOf(root!, active);
      const block = holder && editor.blocks.getBlockByElement(holder);
      if (!block) return undefined;
      return {
        block,
        node: active as Node,
        atEdge: (_field: HTMLElement, step: 1 | -1) =>
          step === -1
            ? active.selectionEnd === 0
            : active.selectionEnd === active.value.length,
      };
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return undefined;
    const range = selection.getRangeAt(0);
    const holder = holderOf(range.startContainer);
    const block = holder && editor.blocks.getBlockByElement(holder);
    if (!block) return undefined;
    return {
      block,
      node: range.startContainer,
      // As Editor.js tells it: only collapsible white space on that side.
      atEdge: (field: HTMLElement, step: 1 | -1) =>
        !/[^\t\n\r ]/.test(
          wordsBeside(
            field,
            range.startContainer,
            range.startOffset,
            step === -1 ? 'before' : 'after',
          ),
        ),
    };
  }

  /** A cut over a section in part leaves its edges, as Backspace does. */
  function onCut(event: ClipboardEvent) {
    if (!reachesEditor(event.target)) return;
    const selected = selectedBlocks();
    if (!selected.length || !letGoOfEdges(selected)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // The window hears the events before the document and the blocks, where
  // Editor.js listens.
  if (root) {
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('cut', onCut, true);
  }

  function destroy() {
    resetSuppression();
    if (root) {
      window.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('cut', onCut, true);
    }
    for (const block of blocks()) {
      block.holder.removeAttribute('data-private-section-member');
      block.holder.removeAttribute('data-private-section-edge');
    }
    settled.clear();
    settledOrder = [];
    heldMoves = [];
  }

  refresh();
  return {
    canMove,
    refresh,
    handleChange,
    holdMoves,
    releaseMoves,
    resetSuppression,
    destroy,
  };
}
