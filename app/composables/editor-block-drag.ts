import type EditorJS from '@editorjs/editorjs';
import {
  EDITOR_BLOCK_SELECTOR as BLOCK_SELECTOR,
  editorBlockOf,
} from './editor-dom';

const SETTINGS_BUTTON_SELECTOR = '.ce-toolbar__settings-btn';
const DROP_TARGET_CLASS = 'ce-block--drop-target';
const DROP_TARGET_BEFORE_CLASS = 'ce-block--drop-target-before';
const BLOCK_DRAG_MIME = 'application/x-thei-editor-block';
const CLICK_GUARD_MS = 250;
/** How near the scroller's edge, in px, a dragged block starts it moving. */
const EDGE_SCROLL_ZONE = 56;
/** The most the scroller moves per frame, at the very edge. */
const EDGE_SCROLL_MAX_STEP = 18;
/** A drag not seen for this long has left the window; nothing scrolls. */
const DRAG_OVER_STALE_MS = 500;
type DropPlacement = 'before' | 'after';

/**
 * How far the scroller moves this frame for a pointer at `y`: nothing
 * between the two edge zones, and inside one, the nearer the edge the more,
 * negative upwards. A short scroller gets zones a third of its height, so
 * some of it is always still.
 */
export function edgeScrollStep(
  y: number,
  top: number,
  bottom: number,
  zone = EDGE_SCROLL_ZONE,
  maxStep = EDGE_SCROLL_MAX_STEP,
): number {
  zone = Math.max(1, Math.min(zone, (bottom - top) / 3));
  if (y < top + zone) {
    const depth = Math.min(1, (top + zone - y) / zone);
    return -Math.ceil(depth * maxStep);
  }
  if (y > bottom - zone) {
    const depth = Math.min(1, (y - (bottom - zone)) / zone);
    return Math.ceil(depth * maxStep);
  }
  return 0;
}

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
  // The modal the editor sits in scrolls, and the page under it is locked.
  // A native drag delivers no wheel events, so the only way past the visible
  // part of the text is to scroll at the edges, from where the pointer is.
  let scroller: HTMLElement | undefined;
  let scrollFrame: number | undefined;
  let lastPointer: { x: number; y: number; at: number } | undefined;
  settingsButton.draggable = true;

  function rememberBlock(event: PointerEvent) {
    const block = blockFromEvent(root, event);
    const blockId = block ? editor.blocks.getBlockByElement(block)?.id : null;
    if (blockId) hoveredBlockId = blockId;
  }

  /**
   * The block the settings button stands next to.
   *
   * Read from where the button is, not from what the pointer last crossed:
   * a block inserted from the toolbox opens a file picker straight away, and
   * nothing is hovered while it is up, so the remembered block can be one
   * that no longer exists or a neighbour.
   */
  function blockAtSettingsButton() {
    const button = settingsButton!.getBoundingClientRect();
    const y = button.top + button.height / 2;
    let nearest: { id: string; distance: number } | undefined;
    for (const block of root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
      const id = block.dataset.id;
      if (!id) continue;
      const rect = block.getBoundingClientRect();
      const distance =
        y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      if (!nearest || distance < nearest.distance) nearest = { id, distance };
      if (distance === 0) break;
    }
    return nearest ? editor.blocks.getById(nearest.id) : null;
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0 || !settingsButtonFromEvent(event)) return;
    // Editor.js opens the settings popover on mousedown, for whichever block
    // it last considered hovered. Let the browser keep the native default so
    // draggable can start, and open the popover on click — always ours, so
    // the two never open for different blocks.
    event.stopPropagation();
    const sourceBlockApi =
      blockAtSettingsButton() ??
      (hoveredBlockId ? editor.blocks.getById(hoveredBlockId) : null);
    pendingSourceId = sourceBlockApi?.id;
  }

  function onClick(event: MouseEvent) {
    if (!settingsButtonFromEvent(event)) return;
    event.stopPropagation();
    if (Date.now() <= skipClickUntil) return;
    const sourceBlock = pendingSourceId
      ? editor.blocks.getById(pendingSourceId)
      : null;
    pendingSourceId = undefined;
    if (!sourceBlock) return;
    // The settings open for Editor.js's current block, and only setting the
    // caret makes this one current. `start` rather than the default: a block
    // born without fields — media before a file is chosen — remembers its
    // current field as index -1, so the default finds no field, returns early
    // and leaves the neighbour current. `start` takes the first field, which
    // also mends that index.
    editor.caret.setToBlock(sourceBlock, 'start');
    editor.toolbar.toggleBlockSettings();
  }

  function onDragStart(event: DragEvent) {
    if (!event.dataTransfer) return;
    const sourceBlock = pendingSourceId
      ? editor.blocks.getById(pendingSourceId)
      : blockAtSettingsButton();
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
    startEdgeScroll();
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
    setDropTarget(
      targetBlock,
      targetBlockId,
      placementAt(targetBlock, event.clientY),
    );
  }

  /**
   * The holder's own `dragover` never fires over the modal's sticky header
   * or its padding, which is exactly where a pointer scrolling up or down
   * goes, so the position is read from the document.
   */
  function onDocumentDragOver(event: DragEvent) {
    lastPointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  }

  function startEdgeScroll() {
    scroller = scrollParentOf(root);
    lastPointer = undefined;
    if (!scroller) return;
    document.addEventListener('dragover', onDocumentDragOver, {
      capture: true,
    });
    scrollFrame = requestAnimationFrame(edgeScrollFrame);
  }

  function edgeScrollFrame(now: number) {
    scrollFrame = requestAnimationFrame(edgeScrollFrame);
    if (!scroller || !lastPointer || now - lastPointer.at > DRAG_OVER_STALE_MS)
      return;
    const rect = scroller.getBoundingClientRect();
    // The sticky header sits inside the scroller and covers its top strip.
    const header = scroller.querySelector(':scope > header');
    const top = header ? header.getBoundingClientRect().bottom : rect.top;
    const step = edgeScrollStep(lastPointer.y, top, rect.bottom);
    if (!step) return;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    if (scroller.scrollTop === before) return;

    // The text moved under a still pointer: the marker follows it, without
    // waiting for the next `dragover`.
    const under = document.elementFromPoint(lastPointer.x, lastPointer.y);
    const block =
      under instanceof Element
        ? under.closest<HTMLElement>(BLOCK_SELECTOR)
        : null;
    if (!block || !root.contains(block)) return;
    const blockId = editor.blocks.getBlockByElement(block)?.id;
    if (blockId)
      setDropTarget(block, blockId, placementAt(block, lastPointer.y));
  }

  function stopEdgeScroll() {
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    scrollFrame = undefined;
    scroller = undefined;
    lastPointer = undefined;
    document.removeEventListener('dragover', onDocumentDragOver, {
      capture: true,
    });
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
    stopEdgeScroll();
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
  return editorBlockOf(root, event.target) ?? null;
}

function placementAt(block: HTMLElement, y: number): DropPlacement {
  const rect = block.getBoundingClientRect();
  return y < rect.top + rect.height / 2 ? 'before' : 'after';
}

/** The nearest ancestor that scrolls: the modal's body, in the editor. */
function scrollParentOf(element: HTMLElement): HTMLElement | undefined {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return undefined;
}
