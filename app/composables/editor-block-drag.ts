import type EditorJS from '@editorjs/editorjs';

const SETTINGS_BUTTON_SELECTOR = '.ce-toolbar__settings-btn';
const BLOCK_SELECTOR = '.ce-block';
const DROP_TARGET_CLASS = 'ce-block--drop-target';
const DROP_TARGET_BEFORE_CLASS = 'ce-block--drop-target-before';
const BLOCK_DRAG_MIME = 'application/x-thei-editor-block';
const CLICK_GUARD_MS = 250;
type DropPlacement = 'before' | 'after';

export function resolveEditorBlockMove(
  sourceId: string,
  targetId: string,
  getIndex: (id: string) => number,
  placement: DropPlacement = 'after',
) {
  const sourceIndex = getIndex(sourceId);
  const targetIndex = getIndex(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return undefined;
  }

  const insertionBoundary = targetIndex + (placement === 'after' ? 1 : 0);
  const insertionIndex =
    insertionBoundary - (sourceIndex < insertionBoundary ? 1 : 0);
  if (insertionIndex === sourceIndex) return undefined;

  return { sourceIndex, targetIndex: insertionIndex };
}

export function createEditorBlockDrag(
  root: HTMLElement,
  editor: EditorJS,
  options: {
    canMove?: (sourceIndex: number, targetIndex: number) => boolean;
  } = {},
) {
  const settingsButton = root.querySelector<HTMLElement>(
    SETTINGS_BUTTON_SELECTOR,
  );
  if (!settingsButton) return () => {};

  let sourceId: string | undefined;
  let targetId: string | undefined;
  let targetElement: HTMLElement | undefined;
  let targetPlacement: DropPlacement = 'after';
  let hoveredBlockId: string | undefined;
  let pendingSourceId: string | undefined;
  let focusResetFrame: number | undefined;
  let skipClickUntil = 0;
  settingsButton.draggable = true;

  function rememberBlock(event: PointerEvent) {
    const block = blockFromEvent(root, event);
    const blockId = block ? editor.blocks.getBlockByElement(block)?.id : null;
    if (blockId) hoveredBlockId = blockId;
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0 || !settingsButtonFromEvent(event)) return;
    const sourceBlockApi = hoveredBlockId
      ? editor.blocks.getById(hoveredBlockId)
      : editor.blocks.getBlockByIndex(editor.blocks.getCurrentBlockIndex());
    if (!sourceBlockApi) return;

    pendingSourceId = sourceBlockApi.id;
    // Editor.js opens the settings popover on mousedown. Let the browser keep
    // the native default so draggable can start, and open the popover on click.
    event.stopPropagation();
  }

  function onClick(event: MouseEvent) {
    if (!settingsButtonFromEvent(event)) return;
    event.stopPropagation();
    if (Date.now() <= skipClickUntil) return;
    const sourceBlock = pendingSourceId
      ? editor.blocks.getById(pendingSourceId)
      : null;
    if (sourceBlock) editor.caret.setToBlock(sourceBlock);
    editor.toolbar.toggleBlockSettings();
    pendingSourceId = undefined;
  }

  function onDragStart(event: DragEvent) {
    if (!event.dataTransfer) return;
    const sourceBlock = pendingSourceId
      ? editor.blocks.getById(pendingSourceId)
      : editor.blocks.getBlockByIndex(editor.blocks.getCurrentBlockIndex());
    if (!sourceBlock) {
      event.preventDefault();
      return;
    }

    sourceId = sourceBlock.id;
    pendingSourceId = undefined;
    setDropTarget();
    window.getSelection()?.removeAllRanges();
    editor.toolbar.toggleBlockSettings(false);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(BLOCK_DRAG_MIME, sourceId);
    root.classList.add('content-editor--dragging-block');
    document.body.classList.add('content-editor-block-dragging');
  }

  function onDragOver(event: DragEvent) {
    if (!sourceId || !event.dataTransfer) return;
    const targetBlock = blockFromEvent(root, event);
    const targetBlockId = targetBlock
      ? editor.blocks.getBlockByElement(targetBlock)?.id
      : undefined;
    if (!targetBlock || !targetBlockId) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = targetBlock.getBoundingClientRect();
    const placement =
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget(targetBlock, targetBlockId, placement);
  }

  function onDrop(event: DragEvent) {
    if (!sourceId || !event.dataTransfer) return;
    const transferredId = event.dataTransfer.getData(BLOCK_DRAG_MIME);
    if (transferredId !== sourceId) return;

    event.preventDefault();
    event.stopPropagation();
    if (targetId) {
      const move = resolveEditorBlockMove(
        sourceId,
        targetId,
        (id) => editor.blocks.getBlockIndex(id),
        targetPlacement,
      );
      if (
        move &&
        (options.canMove?.(move.sourceIndex, move.targetIndex) ?? true)
      ) {
        editor.blocks.move(move.targetIndex, move.sourceIndex);
      }
    }
    finishDrag();
  }

  function onDragLeave(event: DragEvent) {
    if (sourceId) event.stopPropagation();
  }

  function setDropTarget(
    block?: HTMLElement,
    blockId?: string,
    placement: DropPlacement = 'after',
  ) {
    if (targetElement !== block) {
      targetElement?.classList.remove(
        DROP_TARGET_CLASS,
        DROP_TARGET_BEFORE_CLASS,
      );
      targetElement = block;
      targetElement?.classList.add(DROP_TARGET_CLASS);
    }
    targetElement?.classList.toggle(
      DROP_TARGET_BEFORE_CLASS,
      placement === 'before',
    );
    targetId = blockId;
    targetPlacement = placement;
  }

  function finishDrag() {
    const wasDragging = Boolean(sourceId);
    if (wasDragging) {
      skipClickUntil = Date.now() + CLICK_GUARD_MS;
      focusResetFrame = requestAnimationFrame(resetEditorFocus);
    }
    sourceId = undefined;
    setDropTarget();
    pendingSourceId = undefined;
    root.classList.remove('content-editor--dragging-block');
    document.body.classList.remove('content-editor-block-dragging');
    root
      .querySelectorAll(`.${DROP_TARGET_CLASS}`)
      .forEach((block) =>
        block.classList.remove(DROP_TARGET_CLASS, DROP_TARGET_BEFORE_CLASS),
      );
  }

  function resetEditorFocus() {
    focusResetFrame = undefined;
    if (!root.isConnected) return;

    for (let index = 0; index < editor.blocks.getBlocksCount(); index++) {
      const block = editor.blocks.getBlockByIndex(index);
      if (!block?.focusable) continue;
      editor.caret.setToBlock(block);
      break;
    }

    window.getSelection()?.removeAllRanges();
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && root.contains(activeElement)) {
      activeElement.blur();
    }
    editor.toolbar.close();
  }

  settingsButton.addEventListener('dragstart', onDragStart);
  settingsButton.addEventListener('dragend', finishDrag);
  root.addEventListener('pointerover', rememberBlock, { capture: true });
  root.addEventListener('pointerdown', rememberBlock, { capture: true });
  root.addEventListener('mousedown', onMouseDown, { capture: true });
  root.addEventListener('click', onClick, { capture: true });
  root.addEventListener('dragover', onDragOver, { capture: true });
  root.addEventListener('dragleave', onDragLeave, { capture: true });
  root.addEventListener('drop', onDrop, { capture: true });

  return () => {
    finishDrag();
    if (focusResetFrame !== undefined) cancelAnimationFrame(focusResetFrame);
    settingsButton.removeAttribute('draggable');
    settingsButton.removeEventListener('dragstart', onDragStart);
    settingsButton.removeEventListener('dragend', finishDrag);
    root.removeEventListener('pointerover', rememberBlock, { capture: true });
    root.removeEventListener('pointerdown', rememberBlock, { capture: true });
    root.removeEventListener('mousedown', onMouseDown, { capture: true });
    root.removeEventListener('click', onClick, { capture: true });
    root.removeEventListener('dragover', onDragOver, { capture: true });
    root.removeEventListener('dragleave', onDragLeave, { capture: true });
    root.removeEventListener('drop', onDrop, { capture: true });
  };
}

function settingsButtonFromEvent(event: Event) {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>(SETTINGS_BUTTON_SELECTOR)
    : null;
}

function blockFromEvent(root: HTMLElement, event: Event) {
  const block =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(BLOCK_SELECTOR)
      : null;
  return block && root.contains(block) ? block : null;
}
