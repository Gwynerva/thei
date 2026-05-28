/**
 * Composable for pointer-event-based list reordering.
 * Works on both mouse AND touch (unlike HTML5 Drag and Drop which does not
 * fire on mobile touch devices).
 *
 * Usage:
 *   const dragSort = useDragSort((from, to) => { ... reorder your array ... });
 *
 * Bind to each draggable element:
 *   :data-drag-index="index"     ← required for hit-testing during drag
 *   class="touch-none"           ← prevents browser scroll-hijack on touch
 *   @pointerdown="dragSort.onPointerDown(index, $event)"
 *   @click="dragSort.guardClick(() => yourClickHandler())"
 *
 * Use dragSort.draggingIndex / dragSort.dragOverIndex for visual feedback.
 */

const DRAG_THRESHOLD = 6; // px of movement before a drag is recognised

export function useDragSort(onReorder: (from: number, to: number) => void) {
  const draggingIndex = ref<number | null>(null);
  const dragOverIndex = ref<number | null>(null);

  // ── Drag state ──────────────────────────────────────────────────────────────

  let activePointerId: number | null = null;
  let pendingIndex: number | null = null;
  let startX = 0;
  let startY = 0;
  let hasMoved = false;
  // Set briefly after a real drag ends so the synthetic click that follows
  // can be suppressed without poisoning later legitimate clicks.
  let skipNextClickUntil = 0;

  // ── Ghost element ───────────────────────────────────────────────────────────

  let ghostEl: HTMLElement | null = null;
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  // The actual DOM element being dragged — captured directly in onPointerDown.
  let srcElSnapshot: HTMLElement | null = null;

  // ── Hit testing ─────────────────────────────────────────────────────────────

  /**
   * Finds the drag index at a given viewport point by querying the DOM for
   * elements with a [data-drag-index] attribute. No ref-map needed.
   */
  function getIndexAtPoint(x: number, y: number): number | null {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      // Skip anything inside the ghost clone.
      if (ghostEl && ghostEl.contains(el)) continue;
      if (!(el instanceof HTMLElement)) continue;
      const host = el.closest<HTMLElement>('[data-drag-index]');
      if (!host || (ghostEl && ghostEl.contains(host))) continue;
      const idx = parseInt(host.dataset.dragIndex ?? '', 10);
      if (!isNaN(idx)) return idx;
    }
    return null;
  }

  // ── Pointer handlers (registered on document during an active drag) ─────────

  function handlePointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;

    if (!hasMoved) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        hasMoved = true;
        draggingIndex.value = pendingIndex;
        // Disable text selection for the duration of the drag.
        document.body.style.userSelect = 'none';
        // Create a floating ghost clone that follows the pointer.
        if (srcElSnapshot) {
          const rect = srcElSnapshot.getBoundingClientRect();
          grabOffsetX = startX - rect.left;
          grabOffsetY = startY - rect.top;
          ghostEl = srcElSnapshot.cloneNode(true) as HTMLElement;
          // Strip data-drag-index so the ghost doesn't interfere with hit-testing.
          ghostEl.removeAttribute('data-drag-index');
          ghostEl
            .querySelectorAll('[data-drag-index]')
            .forEach((el) => el.removeAttribute('data-drag-index'));
          Object.assign(ghostEl.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '9999',
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            left: `${e.clientX - grabOffsetX}px`,
            top: `${e.clientY - grabOffsetY}px`,
            opacity: '0.85',
            transform: 'scale(1.05)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            transition: 'none',
            margin: '0',
          });
          document.body.appendChild(ghostEl);
        }
      }
    }

    if (hasMoved) {
      // Prevent page scroll on touch while dragging.
      e.preventDefault();
      dragOverIndex.value = getIndexAtPoint(e.clientX, e.clientY);
      if (ghostEl) {
        ghostEl.style.left = `${e.clientX - grabOffsetX}px`;
        ghostEl.style.top = `${e.clientY - grabOffsetY}px`;
      }
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    const from = draggingIndex.value;
    const to = hasMoved ? getIndexAtPoint(e.clientX, e.clientY) : null;
    if (hasMoved) skipNextClickUntil = Date.now() + 250;
    cleanupListeners();
    draggingIndex.value = null;
    dragOverIndex.value = null;
    if (from !== null && to !== null && from !== to) {
      onReorder(from, to);
    }
  }

  function handlePointerCancel(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    cleanupListeners();
    draggingIndex.value = null;
    dragOverIndex.value = null;
  }

  function cleanupListeners() {
    if (hasMoved) {
      document.body.style.userSelect = '';
    }
    ghostEl?.remove();
    ghostEl = null;
    grabOffsetX = 0;
    grabOffsetY = 0;
    srcElSnapshot = null;
    activePointerId = null;
    pendingIndex = null;
    hasMoved = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerCancel);
  }

  onUnmounted(cleanupListeners);

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Bind with `@pointerdown="dragSort.onPointerDown(index, $event)"`.
   * Works for both mouse (left button) and touch/pen.
   * Captures the actual DOM element from e.currentTarget for ghost creation.
   */
  function onPointerDown(index: number, e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (Date.now() > skipNextClickUntil) skipNextClickUntil = 0;
    // Capture the element directly from the event — no ref map needed.
    srcElSnapshot = e.currentTarget as HTMLElement;
    pendingIndex = index;
    startX = e.clientX;
    startY = e.clientY;
    hasMoved = false;
    activePointerId = e.pointerId;
    // Non-passive so handlePointerMove can call e.preventDefault() to block scroll.
    document.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }

  /**
   * Wrap click handlers with this to suppress the synthetic click that fires
   * immediately after a drag completes.
   *
   * Usage: `@click="dragSort.guardClick(() => openItem(index))"`
   */
  function guardClick(handler: () => void) {
    if (Date.now() <= skipNextClickUntil) {
      skipNextClickUntil = 0;
      return;
    }
    skipNextClickUntil = 0;
    handler();
  }

  return {
    draggingIndex: readonly(draggingIndex),
    dragOverIndex: readonly(dragOverIndex),
    onPointerDown,
    guardClick,
  };
}
