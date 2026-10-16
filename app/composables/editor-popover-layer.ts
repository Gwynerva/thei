import {
  computePosition,
  type Placement,
  type ReferenceElement,
} from '@floating-ui/vue';
import {
  POPUP_ARROW_CLASS,
  POPUP_ARROW_EDGES,
  POPUP_ARROW_SIZE,
  POPUP_GAP,
  POPUP_VIEWPORT_PADDING as VIEWPORT_PADDING,
  POPUP_ARROW_TIP,
  arrowFitOf,
  popupMiddleware,
  popupOrigin,
  popupSide,
  rangeAnchor,
  type PopupSide,
} from './popup-placement';

/** What a menu of Editor.js's own points at, and on which side it opens. */
interface EditorPopoverPlace {
  reference: ReferenceElement;
  placement: Placement;
  fallbackPlacements: Placement[];
}

interface LayeredEditorPopover {
  anchor: HTMLElement;
  offsetX: number;
  offsetY: number;
  style: string | null;
  popover: string | null;
  /** Placed as every popup is; without one, where Editor.js put it. */
  place?: EditorPopoverPlace;
  /** The arrow at the menu, and the box of the menu's size it is placed by. */
  arrow?: HTMLElement;
  proxy?: HTMLElement;
  /** Counts the placings, so one that finishes after a newer one is dropped. */
  version: number;
}

const ARROW_SIZE = POPUP_ARROW_SIZE.popup;

/** Editor.js nests submenu popovers inside the root popover wrapper. */
export function isRootEditorPopover(popover: Element) {
  return !popover.classList.contains('ce-popover--nested');
}

/**
 * Places complete Editor.js popover trees in the browser top layer. Keeping
 * nested popovers inside their root preserves Editor.js' local coordinates
 * while excluding the whole tree from a modal's scrollable overflow.
 *
 * The menus a block's settings button and a selection open are placed as
 * every popup of the site is (`popupMiddleware`), with the same arrow at
 * what opened them: the whole tree moves, so its levels keep their places
 * beside the menu. On a phone Editor.js lays the settings out as a sheet at
 * the bottom, and they stay one.
 */
export function createEditorPopoverLayer(root: HTMLElement) {
  const layered = new Map<HTMLElement, LayeredEditorPopover>();
  let frame: number | undefined;
  let queued = false;
  let disposed = false;

  const scheduleSync = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed) sync();
    });
  };

  // A menu opens and is placed before it is first drawn, not a frame later
  // where Editor.js put it. Any other change of the editor waits a frame:
  // its classes change as the text is written.
  const onMutations = (records: MutationRecord[]) => {
    const menu = records.some(
      (record) =>
        record.target instanceof Element &&
        record.target.closest('.ce-popover'),
    );
    if (!menu) {
      scheduleSync();
      return;
    }
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) sync();
    });
  };

  const observer = new MutationObserver(onMutations);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  document.addEventListener('scroll', scheduleSync, true);
  window.addEventListener('resize', scheduleSync);
  // The levels of a tree are measured as drawn: again once they have grown.
  root.addEventListener('animationend', scheduleSync);
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

    const place = placeOf(popover, root);
    const state: LayeredEditorPopover = {
      anchor,
      offsetX: rect.left - anchorRect.left,
      offsetY: rect.top - anchorRect.top,
      style: popover.getAttribute('style'),
      popover: popover.getAttribute('popover'),
      place,
      version: 0,
    };
    if (place) {
      state.arrow = document.createElement('span');
      state.arrow.setAttribute('aria-hidden', 'true');
      state.arrow.dataset.popupArrow = '';
      // Editor.js stacks the menus of a tree at 4; the arrow covers the edge
      // of its own.
      state.arrow.style.zIndex = '5';
      popover.append(state.arrow);
      state.proxy = measuringBox();
    }
    layered.set(popover, state);
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
      const container = directContainer(popover);
      if (!container) continue;
      // A sheet on a phone: Editor.js keeps it at the bottom of the window.
      const sheet = getComputedStyle(container).position === 'fixed';
      if (state.place && !sheet) {
        void place(popover, container, state);
        continue;
      }
      if (state.arrow) state.arrow.hidden = true;

      const anchorRect = state.anchor.getBoundingClientRect();
      const baseLeft = anchorRect.left + state.offsetX;
      const baseTop = anchorRect.top + state.offsetY;
      popover.style.left = `${baseLeft}px`;
      popover.style.top = `${baseTop}px`;
      if (sheet) continue;

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

  async function place(
    popover: HTMLElement,
    container: HTMLElement,
    state: LayeredEditorPopover,
  ) {
    const { place, proxy, arrow } = state;
    if (!place || !proxy || !arrow) return;
    const version = ++state.version;
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    proxy.style.width = `${width}px`;
    proxy.style.height = `${height}px`;
    const { x, y, placement, middlewareData } = await computePosition(
      place.reference,
      proxy,
      {
        strategy: 'fixed',
        placement: place.placement,
        middleware: popupMiddleware({
          placement: place.placement,
          fallbackPlacements: place.fallbackPlacements,
          gap: POPUP_GAP,
          padding: VIEWPORT_PADDING,
          arrowSize: ARROW_SIZE,
          arrowElement: proxy.firstElementChild as HTMLElement,
        }),
      },
    );
    // Dropped when a newer placing began, or the menu closed and opened again.
    if (version !== state.version || layered.get(popover) !== state) return;

    // The menu is placed by moving its tree, where it keeps its own offset —
    // as laid out, not as it is drawn while it grows.
    const rootRect = popover.getBoundingClientRect();
    const offsetX = container.offsetLeft;
    const offsetY = container.offsetTop;
    let left = x - offsetX;
    let top = y - offsetY;
    // A level opened from the menu is kept in the window with it.
    const bounds = openedPopoverBounds(popover);
    const shift = bounds
      ? viewportShift(
          moveBounds(bounds, left - rootRect.left, top - rootRect.top),
          window.innerWidth,
          window.innerHeight,
          VIEWPORT_PADDING,
        )
      : { x: 0, y: 0 };
    left += shift.x;
    top += shift.y;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = middlewareData.hide?.referenceHidden
      ? 'hidden'
      : '';

    const side = popupSide(placement);
    const vertical = side === 'top' || side === 'bottom';
    const fit = arrowFitOf(middlewareData);
    // Moved along its edge, the arrow stays at its anchor; moved off it,
    // the menu no longer stands by the anchor and points at nothing.
    const along =
      ((vertical ? fit?.x : fit?.y) ?? 0) - (vertical ? shift.x : shift.y);
    const length = vertical ? width : height;
    const off =
      !fit ||
      fit.off ||
      (vertical ? shift.y : shift.x) !== 0 ||
      along < 0 ||
      along > length - ARROW_SIZE;
    drawArrow(arrow, side, {
      left: vertical
        ? offsetX + 1 + along
        : side === 'right'
          ? offsetX - ARROW_SIZE / 2
          : offsetX + width - ARROW_SIZE / 2,
      top: vertical
        ? side === 'bottom'
          ? offsetY - ARROW_SIZE / 2
          : offsetY + height - ARROW_SIZE / 2
        : offsetY + 1 + along,
      off,
    });
    popover.style.setProperty(
      '--content-editor-popover-origin',
      popupOrigin(side, off ? undefined : fit, ARROW_SIZE),
    );
  }

  function restore(popover: HTMLElement) {
    const state = layered.get(popover);
    if (!state) return;
    layered.delete(popover);
    state.arrow?.remove();
    state.proxy?.remove();
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
    disposed = true;
    observer.disconnect();
    document.removeEventListener('scroll', scheduleSync, true);
    window.removeEventListener('resize', scheduleSync);
    root.removeEventListener('animationend', scheduleSync);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    for (const popover of [...layered.keys()]) restore(popover);
  };
}

/**
 * The block's settings open beside the button that opened them, over the
 * text; the inline toolbar under the words it acts on — the last line of
 * them, nearest to it.
 */
function placeOf(
  popover: HTMLElement,
  root: HTMLElement,
): EditorPopoverPlace | undefined {
  if (popover.parentElement?.classList.contains('ce-settings')) {
    const button = root.querySelector<HTMLElement>('.ce-toolbar__settings-btn');
    if (!button) return undefined;
    return {
      reference: button,
      placement: 'right-start',
      fallbackPlacements: ['left-start', 'bottom-start', 'top-start'],
    };
  }
  if (popover.classList.contains('ce-popover--inline')) {
    return {
      reference: rangeAnchor(() => selectionIn(root), root),
      placement: 'bottom-start',
      fallbackPlacements: ['top-start'],
    };
  }
  return undefined;
}

/** The words selected in the editor, if any are. */
function selectionIn(root: HTMLElement) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  return range &&
    !range.collapsed &&
    root.contains(range.commonAncestorContainer)
    ? range
    : undefined;
}

/** A box of a menu's size, out of sight, that the placing measures. */
function measuringBox() {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  const arrow = document.createElement('span');
  Object.assign(arrow.style, {
    position: 'absolute',
    width: `${ARROW_SIZE}px`,
    height: `${ARROW_SIZE}px`,
  });
  box.append(arrow);
  document.body.append(box);
  return box;
}

function drawArrow(
  arrow: HTMLElement,
  side: PopupSide,
  at: { left: number; top: number; off: boolean },
) {
  const className = [
    POPUP_ARROW_CLASS,
    POPUP_ARROW_EDGES[side],
    POPUP_ARROW_TIP[side],
  ].join(' ');
  // Only when it changes: the class is watched, and would place it again.
  if (arrow.className !== className) arrow.className = className;
  arrow.hidden = false;
  Object.assign(arrow.style, {
    width: `${ARROW_SIZE}px`,
    height: `${ARROW_SIZE}px`,
    left: `${at.left}px`,
    top: `${at.top}px`,
    visibility: at.off ? 'hidden' : '',
  });
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

function moveBounds(
  bounds: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
  x: number,
  y: number,
) {
  return {
    left: bounds.left + x,
    top: bounds.top + y,
    right: bounds.right + x,
    bottom: bounds.bottom + y,
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
