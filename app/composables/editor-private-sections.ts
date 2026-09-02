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

export function createEditorPrivateSections(editor: EditorJS) {
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
    suppressionTimer = setTimeout(resetSuppression, 1000);
  }
  let insideIds = new Set<string>();
  let boundaryByBlockId = new Map<
    string,
    { sectionId: string; edge: 'start' | 'end' }
  >();

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
    insideIds = new Set();
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
          '.content-editor-private-section-boundary__label span',
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
        insideIds.add(block.id);
        desired.get(block.id)!.privateSectionMember = 'true';
        if (index === group[0]!.index + 1) {
          desired.get(block.id)!.privateSectionMemberStart = 'true';
        }
        if (index === group[1]!.index - 1) {
          desired.get(block.id)!.privateSectionMemberEnd = 'true';
        }
        const wrapper = block.holder.querySelector<HTMLElement>(
          '.content-editor-private-wrap',
        );
        if (wrapper?.hasAttribute('data-content-private'))
          wrapper.removeAttribute('data-content-private');
      }
    }
    for (const block of currentBlocks) {
      for (const key of [
        'privateSectionMember',
        'privateSectionEdge',
        'privateSectionMemberStart',
        'privateSectionMemberEnd',
      ]) {
        const value = desired.get(block.id)![key];
        if (block.holder.dataset[key] === value) continue;
        if (value === undefined) delete block.holder.dataset[key];
        else block.holder.dataset[key] = value;
      }
    }
  }

  function isPrivateAccessDisabled(blockId: string) {
    return insideIds.has(blockId) || boundaryByBlockId.has(blockId);
  }

  function handleChange(
    value: BlockMutationEvent | BlockMutationEvent[],
  ): boolean {
    const events = Array.isArray(value) ? value : [value];
    let persistentChange = false;

    for (const event of events) {
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
          if (!editorPrivateSectionLayoutIsValid(withCounterpart)) {
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

      if (event.type === 'block-moved') {
        if (ignoredMovedIds.delete(target.id)) continue;
        if (!editorPrivateSectionLayoutIsValid(descriptors())) {
          const detail = event.detail as typeof event.detail & {
            fromIndex: number;
            toIndex: number;
          };
          suppress(ignoredMovedIds, target.id);
          editor.blocks.move(detail.fromIndex, detail.toIndex);
          refresh();
          continue;
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
      block.holder.removeAttribute('data-private-section-member-start');
      block.holder.removeAttribute('data-private-section-member-end');
    }
    insideIds.clear();
    boundaryByBlockId.clear();
  }

  refresh();
  return {
    canMove,
    refresh,
    handleChange,
    isPrivateAccessDisabled,
    resetSuppression,
    destroy,
  };
}
