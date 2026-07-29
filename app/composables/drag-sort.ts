const DRAG_THRESHOLD = 6;

export interface PointerDragSortState {
  draggingIndex: number | null;
  dragOverIndex: number | null;
}

export function createPointerDragSort(
  onReorder: (from: number, to: number) => void,
  onStateChange: (state: PointerDragSortState) => void = () => {},
) {
  let state: PointerDragSortState = {
    draggingIndex: null,
    dragOverIndex: null,
  };
  let activePointerId: number | null = null;
  let pendingIndex: number | null = null;
  let startX = 0;
  let startY = 0;
  let hasMoved = false;
  let skipNextClickUntil = 0;
  let ghost: HTMLElement | null = null;
  let source: HTMLElement | null = null;
  let root: HTMLElement | null = null;
  let grabOffsetX = 0;
  let grabOffsetY = 0;

  function publish(patch: Partial<PointerDragSortState>) {
    state = { ...state, ...patch };
    onStateChange(state);
  }

  function indexAtPoint(x: number, y: number): number | null {
    for (const element of document.elementsFromPoint(x, y)) {
      if (ghost?.contains(element) || !(element instanceof HTMLElement)) {
        continue;
      }
      const host = element.closest<HTMLElement>('[data-drag-index]');
      if (!host || !root?.contains(host)) continue;
      const index = Number.parseInt(host.dataset.dragIndex ?? '', 10);
      if (!Number.isNaN(index)) return index;
    }
    return null;
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    if (!hasMoved) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (dx * dx + dy * dy <= DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      hasMoved = true;
      source?.setPointerCapture?.(event.pointerId);
      publish({ draggingIndex: pendingIndex });
      document.body.style.userSelect = 'none';
      if (source) {
        const rect = source.getBoundingClientRect();
        grabOffsetX = startX - rect.left;
        grabOffsetY = startY - rect.top;
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.removeAttribute('data-drag-index');
        ghost
          .querySelectorAll('[data-drag-index]')
          .forEach((element) => element.removeAttribute('data-drag-index'));
        Object.assign(ghost.style, {
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: '9999',
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          opacity: '0.86',
          transform: 'scale(1.04)',
          boxShadow: '0 12px 32px rgb(0 0 0 / 35%)',
          transition: 'none',
          margin: '0',
        });
        document.body.append(ghost);
      }
    }

    event.preventDefault();
    const dragOverIndex = indexAtPoint(event.clientX, event.clientY);
    publish({ dragOverIndex });
    if (ghost) {
      ghost.style.left = `${event.clientX - grabOffsetX}px`;
      ghost.style.top = `${event.clientY - grabOffsetY}px`;
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    const from = state.draggingIndex;
    const to = hasMoved ? indexAtPoint(event.clientX, event.clientY) : null;
    if (hasMoved) skipNextClickUntil = Date.now() + 250;
    cleanup();
    if (from !== null && to !== null && from !== to) onReorder(from, to);
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === activePointerId) cleanup();
  }

  function cleanup() {
    if (hasMoved) document.body.style.userSelect = '';
    ghost?.remove();
    ghost = null;
    if (
      source &&
      activePointerId !== null &&
      source.hasPointerCapture?.(activePointerId)
    ) {
      source.releasePointerCapture(activePointerId);
    }
    source = null;
    root = null;
    activePointerId = null;
    pendingIndex = null;
    hasMoved = false;
    publish({ draggingIndex: null, dragOverIndex: null });
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
  }

  function onPointerDown(
    index: number,
    event: PointerEvent,
    container?: HTMLElement,
  ) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (activePointerId !== null) return;
    source = event.currentTarget as HTMLElement;
    root = container ?? source.parentElement;
    pendingIndex = index;
    startX = event.clientX;
    startY = event.clientY;
    activePointerId = event.pointerId;
    hasMoved = false;
    document.addEventListener('pointermove', onPointerMove, {
      passive: false,
    });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  }

  function guardClick(handler: () => void) {
    if (Date.now() <= skipNextClickUntil) {
      skipNextClickUntil = 0;
      return;
    }
    skipNextClickUntil = 0;
    handler();
  }

  return { onPointerDown, guardClick, cleanup };
}

export function useDragSort(onReorder: (from: number, to: number) => void) {
  const draggingIndex = ref<number | null>(null);
  const dragOverIndex = ref<number | null>(null);
  const controller = createPointerDragSort(onReorder, (state) => {
    draggingIndex.value = state.draggingIndex;
    dragOverIndex.value = state.dragOverIndex;
  });
  onUnmounted(controller.cleanup);
  return {
    draggingIndex: readonly(draggingIndex),
    dragOverIndex: readonly(dragOverIndex),
    onPointerDown: controller.onPointerDown,
    guardClick: controller.guardClick,
  };
}
