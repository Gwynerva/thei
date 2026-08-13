interface LayeredEditorPopover {
  anchor: HTMLElement;
  offsetX: number;
  offsetY: number;
  style: string | null;
  popover: string | null;
}

const VIEWPORT_PADDING = 4;

/** Editor.js nests submenu popovers inside the root popover wrapper. */
export function isRootEditorPopover(popover: Element) {
  return !popover.classList.contains('ce-popover--nested');
}

/**
 * Places complete Editor.js popover trees in the browser top layer. Keeping
 * nested popovers inside their root preserves Editor.js' local coordinates
 * while excluding the whole tree from a modal's scrollable overflow.
 */
export function createEditorPopoverLayer(root: HTMLElement) {
  const layered = new Map<HTMLElement, LayeredEditorPopover>();
  let frame: number | undefined;

  const scheduleSync = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      sync();
    });
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  document.addEventListener('scroll', scheduleSync, true);
  window.addEventListener('resize', scheduleSync);
  scheduleSync();

  function sync() {
    const roots = root.querySelectorAll<HTMLElement>('.ce-popover');
    for (const popover of roots) {
      if (!isRootEditorPopover(popover)) continue;
      if (popover.classList.contains('ce-popover--opened')) {
        if (!layered.has(popover)) layer(popover);
      } else {
        restore(popover);
      }
    }

    for (const popover of layered.keys()) {
      if (!popover.isConnected || !root.contains(popover)) restore(popover);
    }
    updatePositions();
  }

  function layer(popover: HTMLElement) {
    if (typeof popover.showPopover !== 'function') return;
    const anchor = popover.parentElement;
    const container = directContainer(popover);
    if (!anchor || !container) return;

    const rect = popover.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (containerRect.width === 0 && containerRect.height === 0) return;

    layered.set(popover, {
      anchor,
      offsetX: rect.left - anchorRect.left,
      offsetY: rect.top - anchorRect.top,
      style: popover.getAttribute('style'),
      popover: popover.getAttribute('popover'),
    });
    popover.popover = 'manual';
    Object.assign(popover.style, {
      position: 'fixed',
      inset: 'auto',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: '0',
      height: '0',
      margin: '0',
      overflow: 'visible',
    });
    try {
      popover.showPopover();
    } catch {
      restore(popover);
    }
  }

  function updatePositions() {
    for (const [popover, state] of layered) {
      if (!popover.isConnected || !state.anchor.isConnected) continue;
      const anchorRect = state.anchor.getBoundingClientRect();
      const baseLeft = anchorRect.left + state.offsetX;
      const baseTop = anchorRect.top + state.offsetY;
      popover.style.left = `${baseLeft}px`;
      popover.style.top = `${baseTop}px`;

      const container = directContainer(popover);
      if (!container || getComputedStyle(container).position === 'fixed') {
        continue;
      }

      const bounds = openedPopoverBounds(popover);
      if (!bounds) continue;
      const shift = viewportShift(
        bounds,
        window.innerWidth,
        window.innerHeight,
        VIEWPORT_PADDING,
      );
      popover.style.left = `${baseLeft + shift.x}px`;
      popover.style.top = `${baseTop + shift.y}px`;
    }
  }

  function restore(popover: HTMLElement) {
    const state = layered.get(popover);
    if (!state) return;
    layered.delete(popover);
    try {
      if (popover.matches(':popover-open')) popover.hidePopover();
    } catch {
      // The node may already have been detached by Editor.js.
    }
    if (state.popover === null) popover.removeAttribute('popover');
    else popover.setAttribute('popover', state.popover);
    if (state.style === null) popover.removeAttribute('style');
    else popover.setAttribute('style', state.style);
  }

  return () => {
    observer.disconnect();
    document.removeEventListener('scroll', scheduleSync, true);
    window.removeEventListener('resize', scheduleSync);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    for (const popover of [...layered.keys()]) restore(popover);
  };
}

function directContainer(popover: HTMLElement) {
  return Array.from(popover.children).find((element) =>
    element.classList.contains('ce-popover__container'),
  ) as HTMLElement | undefined;
}

function openedPopoverBounds(root: HTMLElement) {
  const containers = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.ce-popover--opened > .ce-popover__container',
    ),
  ).filter((container) => container.getClientRects().length > 0);
  if (containers.length === 0) return undefined;

  const rects = containers.map((container) =>
    container.getBoundingClientRect(),
  );
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

export function viewportShift(
  bounds: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
) {
  return {
    x: axisShift(bounds.left, bounds.right, viewportWidth, padding),
    y: axisShift(bounds.top, bounds.bottom, viewportHeight, padding),
  };
}

function axisShift(start: number, end: number, size: number, padding: number) {
  const available = size - padding * 2;
  const extent = end - start;
  if (extent > available) return padding - start;
  if (start < padding) return padding - start;
  if (end > size - padding) return size - padding - end;
  return 0;
}
