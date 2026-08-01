import type EditorJS from '@editorjs/editorjs';

const SETTINGS_BUTTON_SELECTOR = '.ce-toolbar__settings-btn';
const BLOCK_SELECTOR = '.ce-block';
const DROP_TARGET_CLASS = 'ce-block--drop-target';
const BLOCK_DRAG_MIME = 'application/x-thei-editor-block';
const CLICK_GUARD_MS = 250;

export function resolveEditorBlockMove(
  sourceId: string,
  targetId: string,
  getIndex: (id: string) => number,
) {
  const sourceIndex = getIndex(sourceId);
  const targetIndex = getIndex(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return undefined;
  }

  // The Editor.js drop indicator is rendered after the target block. When the
  // source comes from below, its removal does not shift the target, so the
  // insertion index needs to advance by one to stay below the indicator.
  const insertionIndex =
    sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
  if (insertionIndex === sourceIndex) return undefined;

  return { sourceIndex, targetIndex: insertionIndex };
}

export function createEditorBlockDrag(root: HTMLElement, editor: EditorJS) {
  const settingsButton = root.querySelector<HTMLElement>(
    SETTINGS_BUTTON_SELECTOR,
  );
  if (!settingsButton) return () => {};

  let sourceId: string | undefined;
  let targetId: string | undefined;
  let targetElement: HTMLElement | undefined;
  let hoveredBlockId: string | undefined;
  let pendingSourceId: string | undefined;
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
    setDropTarget(targetBlock, targetBlockId);
  }

  function onDrop(event: DragEvent) {
    if (!sourceId || !event.dataTransfer) return;
    const transferredId = event.dataTransfer.getData(BLOCK_DRAG_MIME);
    if (transferredId !== sourceId) return;

    event.preventDefault();
    event.stopPropagation();
    if (targetId) {
      const move = resolveEditorBlockMove(sourceId, targetId, (id) =>
        editor.blocks.getBlockIndex(id),
      );
      if (move) editor.blocks.move(move.targetIndex, move.sourceIndex);
    }
    finishDrag();
  }

  function onDragLeave(event: DragEvent) {
    if (sourceId) event.stopPropagation();
  }

  function setDropTarget(block?: HTMLElement, blockId?: string) {
    if (targetElement !== block) {
      targetElement?.classList.remove(DROP_TARGET_CLASS);
      targetElement = block;
      targetElement?.classList.add(DROP_TARGET_CLASS);
    }
    targetId = blockId;
  }

  function finishDrag() {
    if (sourceId) skipClickUntil = Date.now() + CLICK_GUARD_MS;
    sourceId = undefined;
    setDropTarget();
    pendingSourceId = undefined;
    root.classList.remove('content-editor--dragging-block');
    document.body.classList.remove('content-editor-block-dragging');
    root
      .querySelectorAll(`.${DROP_TARGET_CLASS}`)
      .forEach((block) => block.classList.remove(DROP_TARGET_CLASS));
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
