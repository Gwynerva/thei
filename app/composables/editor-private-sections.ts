import type EditorJS from '@editorjs/editorjs';
import type { BlockMutationEvent } from '@editorjs/editorjs';

export interface EditorPrivateSectionBlock {
  id: string;
  sectionId?: string;
}

export function editorPrivateSectionLayoutIsValid(
  blocks: readonly EditorPrivateSectionBlock[],
) {
  const boundaries = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (!block.sectionId) return;
    const indices = boundaries.get(block.sectionId) ?? [];
    indices.push(index);
    boundaries.set(block.sectionId, indices);
  });

  const ranges = Array.from(boundaries.values())
    .map((indices) => {
      if (indices.length !== 2) return undefined;
      return { start: indices[0]!, end: indices[1]! };
    })
    .filter((range) => range !== undefined)
    .sort((left, right) => left.start - right.start);
  if (ranges.length !== boundaries.size) return false;

  let previousEnd = -1;
  for (const range of ranges) {
    if (range.start <= previousEnd) return false;
    previousEnd = range.end;
  }
  return true;
}

/**
 * The layout with the boundaries of an unpaired section read as plain blocks.
 * Within one batch of Editor.js changes a section can be half there: a new one
 * waits for its end, a removed one for the removal of its other boundary.
 * Neither says anything about the rest of the layout.
 */
export function editorPrivateSectionPairedLayout(
  blocks: readonly EditorPrivateSectionBlock[],
): EditorPrivateSectionBlock[] {
  const counts = new Map<string, number>();
  for (const { sectionId } of blocks)
    if (sectionId) counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
  return blocks.map((block) =>
    block.sectionId && counts.get(block.sectionId) !== 2
      ? { id: block.id }
      : block,
  );
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

export function createEditorPrivateSections(
  editor: EditorJS,
  options: { suppressionDuration?: number } = {},
) {
  const suppressionDuration = options.suppressionDuration ?? 1000;
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
  let boundaryByBlockId = new Map<
    string,
    { sectionId: string; edge: 'start' | 'end' }
  >();
  /**
   * The order of the blocks when the layout was last valid: where a block an
   * invalid move took away goes back to. Editor.js batches its change events
   * and keeps only the latest move of each block, with indexes the rest of the
   * batch may have shifted, so the events themselves cannot say where it was.
   */
  let settledOrder: string[] = [];

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
    const remembered = boundaryByBlockId.get(block.id);
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

  function descriptors(): EditorPrivateSectionBlock[] {
    return blocks().map((block) => ({
      id: block.id,
      sectionId: boundaryFromBlock(block)?.sectionId,
    }));
  }

  function canMove(sourceIndex: number, targetIndex: number) {
    return editorPrivateSectionMoveIsValid(
      descriptors(),
      sourceIndex,
      targetIndex,
    );
  }

  function refresh() {
    const currentBlocks = blocks();
    const groups = new Map<
      string,
      Array<{ index: number; block: (typeof currentBlocks)[number] }>
    >();
    boundaryByBlockId = new Map();

    const desired = new Map(
      currentBlocks.map((block) => [block.id, {} as Record<string, string>]),
    );

    currentBlocks.forEach((block, index) => {
      const boundary = boundaryFromBlock(block);
      if (!boundary) return;
      const group = groups.get(boundary.sectionId) ?? [];
      group.push({ index, block });
      groups.set(boundary.sectionId, group);
    });

    for (const [sectionId, group] of groups) {
      if (group.length !== 2) continue;
      group.sort((left, right) => left.index - right.index);
      group.forEach(({ block }, boundaryIndex) => {
        const edge = boundaryIndex === 0 ? 'start' : 'end';
        boundaryByBlockId.set(block.id, { sectionId, edge });
        desired.get(block.id)!.privateSectionEdge = edge;
        const element = block.holder.querySelector<HTMLElement>(
          '[data-private-section-id]',
        );
        if (!element) return;
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
      });

      for (let index = group[0]!.index + 1; index < group[1]!.index; index++) {
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

    const layout = descriptors();
    if (
      editorPrivateSectionLayoutIsValid(
        editorPrivateSectionPairedLayout(layout),
      )
    )
      settledOrder = layout.map((block) => block.id);
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

  function handleChange(
    value: BlockMutationEvent | BlockMutationEvent[],
  ): boolean {
    const events = Array.isArray(value) ? value : [value];
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
      if (
        editorPrivateSectionLayoutIsValid(
          editorPrivateSectionPairedLayout(descriptors()),
        )
      )
        persistentChange = true;
      else restoreMoved(movedIds);
    }

    for (const event of events) {
      if (event.type === 'block-moved') continue;
      const target = event.detail.target;
      if (event.type === 'block-added') {
        if (ignoredAddedIds.delete(target.id)) continue;
        const boundary = boundaryFromBlock(target);
        const createPair = target.holder.querySelector<HTMLElement>(
          '[data-private-section-create-pair="true"]',
        );
        if (boundary && createPair) {
          createPair.removeAttribute('data-private-section-create-pair');
          const index = editor.blocks.getBlockIndex(target.id);
          const withCounterpart = descriptors();
          withCounterpart.splice(index + 1, 0, {
            id: `${target.id}-counterpart`,
            sectionId: boundary.sectionId,
          });
          if (
            !editorPrivateSectionLayoutIsValid(
              editorPrivateSectionPairedLayout(withCounterpart),
            )
          ) {
            suppress(ignoredRemovedIds, target.id);
            editor.blocks.delete(index);
            continue;
          }
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
        }
        persistentChange = true;
        continue;
      }

      if (event.type === 'block-removed') {
        if (ignoredRemovedIds.delete(target.id)) continue;
        const boundary = boundaryFromBlock(target);
        if (boundary) {
          const counterpart = blocks().find(
            (block) =>
              block.id !== target.id &&
              boundaryFromBlock(block)?.sectionId === boundary.sectionId,
          );
          if (counterpart) {
            suppress(ignoredRemovedIds, counterpart.id);
            editor.blocks.delete(editor.blocks.getBlockIndex(counterpart.id));
          }
        }
        persistentChange = true;
        continue;
      }

      // Boundary UI is decorative; persisted boundaries change structurally.
      if (!boundaryFromBlock(target)) persistentChange = true;
    }

    refresh();
    return persistentChange;
  }

  function destroy() {
    resetSuppression();
    for (const block of blocks()) {
      block.holder.removeAttribute('data-private-section-member');
      block.holder.removeAttribute('data-private-section-edge');
    }
    boundaryByBlockId.clear();
    settledOrder = [];
  }

  refresh();
  return {
    canMove,
    refresh,
    handleChange,
    resetSuppression,
    destroy,
  };
}
