import {
  arrow as arrowMiddleware,
  autoUpdate,
  flip,
  hide,
  offset as offsetMiddleware,
  shift,
  size,
  useFloating,
  type Middleware,
  type MiddlewareData,
  type Placement,
  type ReferenceElement,
  type VirtualElement,
} from '@floating-ui/vue';
import type { MaybeRefOrGetter, Ref } from 'vue';

/**
 * Where a popup stands by its anchor, and where its arrow points: the one
 * placement of every popup of the site — `FloatingPopup`, the title hint,
 * the menus Editor.js draws itself (`editor-popover-layer.ts`) — so they turn
 * over, keep clear of the edges and point the same way.
 */

export type PopupSide = 'top' | 'right' | 'bottom' | 'left';

/** Between the anchor and the tip of a popup's arrow. */
export const POPUP_GAP = 3;
/** How far a popup keeps from the window's edge. */
export const POPUP_VIEWPORT_PADDING = 8;

/** The arrow's square, before it is turned to a corner. */
export const POPUP_ARROW_SIZE = { popup: 10, hint: 8 } as const;

/**
 * The arrow is a square turned to a corner. Its tip, the corner that points
 * out at the anchor, is eased; a popup with a border carries it round the
 * two outer sides.
 */
export const POPUP_ARROW_TIP: Record<PopupSide, string> = {
  bottom: 'rounded-tl-xs',
  top: 'rounded-br-xs',
  right: 'rounded-bl-xs',
  left: 'rounded-tr-xs',
};
/** The arrow of a popup's surface, drawn as the surface is. */
export const POPUP_ARROW_CLASS =
  'pointer-events-none absolute rotate-45 border-border-1 bg-bg-2';
export const POPUP_ARROW_EDGES: Record<PopupSide, string> = {
  bottom: 'border-t border-l',
  top: 'border-b border-r',
  right: 'border-b border-l',
  left: 'border-t border-r',
};

/** The arrow keeps this far from the popup's corners. */
const ARROW_PADDING = 10;

const STATIC_SIDE: Record<PopupSide, PopupSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

export interface PopupMiddlewareOptions {
  /** Where the popup opens when there is room. */
  placement: Placement;
  fallbackPlacements?: Placement[];
  /** Between the anchor and the arrow's tip, or the popup's edge without one. */
  gap: number;
  /** Kept clear of the window's edge. */
  padding: number;
  shiftCrossAxis?: boolean;
  /**
   * Placed once and still open: it keeps that side. What it holds may grow —
   * an answer coming in — and it scrolls in the room it has rather than jump
   * to the other side of its anchor.
   */
  keepSide?: boolean;
  /** The arrow's square, or nothing for a popup without one. */
  arrowSize?: number;
  arrowElement?: MaybeRefOrGetter<HTMLElement | null | undefined>;
  /** Writes the room the popup has, for what it holds to fit it. */
  onRoom?: (
    room: { width: number; height: number; anchorWidth: number },
    floating: HTMLElement,
  ) => void;
}

/** Where the arrow goes along the popup's edge, once the popup is placed. */
export interface ArrowFit {
  x?: number;
  y?: number;
  /** The arrow would point past its anchor: it is left out. */
  off: boolean;
}

export function popupSide(placement: Placement) {
  return placement.split('-')[0] as PopupSide;
}

/** The arrow's place, as `arrowFit` left it in the middleware's data. */
export function arrowFitOf(data: MiddlewareData) {
  return data.arrowFit as ArrowFit | undefined;
}

/**
 * Where the arrow goes, now the popup has its place: at the middle of the
 * anchor — or, for an anchor as wide as the popup, near the edge the popup
 * is aligned to, close to what it is about — and away, when no point of
 * the popup's edge is over the anchor any more.
 */
function arrowFit(size: number): Middleware {
  return {
    name: 'arrowFit',
    fn({ placement, rects, middlewareData, x, y }) {
      const placed = middlewareData.arrow;
      if (!placed) return {};
      const [side, align] = placement.split('-') as [PopupSide, string?];
      const vertical = side === 'top' || side === 'bottom';
      const length = vertical ? rects.floating.width : rects.floating.height;
      const anchorLength = vertical
        ? rects.reference.width
        : rects.reference.height;
      let along = (vertical ? placed.x : placed.y) ?? 0;
      if (align && anchorLength >= length - 4) {
        const edge = 14;
        along = align === 'start' ? edge : length - edge - size;
      }
      const centre = (vertical ? x : y) + along + size / 2;
      const from = vertical ? rects.reference.x : rects.reference.y;
      const to = from + anchorLength;
      // Slid over its anchor to stay whole, the popup no longer stands
      // beside it: an arrow would point from inside it.
      const { reference, floating } = rects;
      const covers = {
        bottom: y < reference.y + reference.height - 1,
        top: y + floating.height > reference.y + 1,
        right: x < reference.x + reference.width - 1,
        left: x + floating.width > reference.x + 1,
      }[side];
      const fit: ArrowFit = {
        [vertical ? 'x' : 'y']: along,
        off: covers || centre < from + 1 || centre > to - 1,
      };
      return { data: fit };
    },
  };
}

const OPPOSITE: Record<PopupSide, PopupSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * Where a popup may turn to, in order: the places it was given — the other
 * side by default — then, for one above or below, the sides, level with the
 * anchor's edge it would have stood at. A popup too tall for the room above
 * and below its anchor stands beside it rather than over it.
 */
export function popupFallbacks(
  placement: Placement,
  given?: Placement[],
): Placement[] {
  const [side, align] = placement.split('-') as [PopupSide, string?];
  const fallbacks: Placement[] = given ?? [
    (align ? `${OPPOSITE[side]}-${align}` : OPPOSITE[side]) as Placement,
  ];
  if (side === 'left' || side === 'right') return fallbacks;
  const level = side === 'bottom' ? 'start' : 'end';
  const sides: Placement[] = [`right-${level}`, `left-${level}`];
  return [
    ...fallbacks,
    ...sides.filter(
      (place) => place !== placement && !fallbacks.includes(place),
    ),
  ];
}

/** The steps every popup is placed by, in their order. */
export function popupMiddleware(options: PopupMiddlewareOptions): Middleware[] {
  const { arrowSize, padding } = options;
  // The square turned to a corner stands out by half its diagonal.
  const reach = arrowSize ? Math.round(arrowSize * Math.SQRT1_2) : 0;
  return [
    offsetMiddleware(options.gap + reach),
    ...(options.keepSide
      ? []
      : [
          flip({
            padding,
            fallbackPlacements: popupFallbacks(
              options.placement,
              options.fallbackPlacements,
            ),
            // Going past the window along its side is the sliding's to mend:
            // only no room at the side it stands on turns it elsewhere.
            crossAxis: 'alignment',
          }),
        ]),
    shift({ padding, crossAxis: Boolean(options.shiftCrossAxis) }),
    size({
      padding,
      apply({ availableWidth, availableHeight, elements, rects }) {
        options.onRoom?.(
          {
            width: Math.max(0, availableWidth),
            height: Math.max(0, availableHeight),
            anchorWidth: rects.reference.width,
          },
          elements.floating,
        );
      },
    }),
    ...(arrowSize && options.arrowElement
      ? [
          arrowMiddleware({
            element: options.arrowElement,
            padding: ARROW_PADDING,
          }),
          arrowFit(arrowSize),
        ]
      : []),
    // An anchor scrolled out of the box it scrolls in takes its popup along,
    // rather than leave it floating over whatever is there now.
    hide({ padding }),
  ];
}

/**
 * The arrow's box inside its popup: its centre on the popup's outer edge,
 * past the border it stands on. Before the popup is placed it is only its
 * size, which the placing measures.
 */
export function popupArrowStyle(
  side: PopupSide,
  fit: ArrowFit | undefined,
  size: number,
  border: number,
) {
  const style: Record<string, string> = {
    width: `${size}px`,
    height: `${size}px`,
  };
  if (!fit) return style;
  style[STATIC_SIDE[side]] = `${-size / 2 - border}px`;
  if (fit.x !== undefined) style.left = `${fit.x}px`;
  if (fit.y !== undefined) style.top = `${fit.y}px`;
  if (fit.off) style.visibility = 'hidden';
  return style;
}

/** The popup grows from the tip of its arrow, or from its anchor's side. */
export function popupOrigin(
  side: PopupSide,
  fit: ArrowFit | undefined,
  size: number,
) {
  const vertical = side === 'top' || side === 'bottom';
  const along = fit
    ? `${((vertical ? fit.x : fit.y) ?? 0) + size / 2}px`
    : '50%';
  const across = { top: '100%', bottom: '0', left: '100%', right: '0' }[side];
  return vertical ? `${along} ${across}` : `${across} ${along}`;
}

/**
 * Words in a text as a popup's anchor: the last of their lines, the one a
 * popup below them is nearest to, wherever the text has moved since. Words
 * gone for a moment — a selection taken away, a text being rewritten —
 * leave it where they were last seen. `range` is the words, or how to find
 * them each time.
 */
export function rangeAnchor(
  range: Range | (() => Range | null | undefined),
  contextElement: Element,
): VirtualElement {
  let last: DOMRect | undefined;
  const rect = () => {
    const words = typeof range === 'function' ? range() : range;
    const boxes = words ? [...words.getClientRects()] : [];
    // A caret's line has no width, and is all there is of it.
    const line = boxes.filter((box) => box.width > 0).at(-1) ?? boxes.at(-1);
    if (line) last = DOMRect.fromRect(line);
    return last ?? contextElement.getBoundingClientRect();
  };
  return {
    contextElement,
    getBoundingClientRect: rect,
    getClientRects: () => [rect()],
  };
}

export interface PopupPlacementOptions {
  open: Ref<boolean>;
  placement: MaybeRefOrGetter<Placement>;
  fallbackPlacements?: MaybeRefOrGetter<Placement[] | undefined>;
  gap: MaybeRefOrGetter<number>;
  padding: MaybeRefOrGetter<number>;
  shiftCrossAxis?: MaybeRefOrGetter<boolean>;
  arrowSize: MaybeRefOrGetter<number | undefined>;
  /** The popup's border, which the arrow stands on; 1px unless said. */
  border?: number;
  onRoom?: PopupMiddlewareOptions['onRoom'];
}

export function usePopupPlacement(
  reference: Ref<ReferenceElement | null | undefined>,
  floating: Ref<HTMLElement | null | undefined>,
  arrowElement: Ref<HTMLElement | null | undefined>,
  options: PopupPlacementOptions,
) {
  /** The side it was placed on, kept while it stays open. */
  const kept = ref<Placement>();
  watch(options.open, () => (kept.value = undefined));
  const middleware = computed(() =>
    popupMiddleware({
      placement: kept.value ?? toValue(options.placement),
      keepSide: Boolean(kept.value),
      fallbackPlacements: toValue(options.fallbackPlacements),
      gap: toValue(options.gap),
      padding: toValue(options.padding),
      shiftCrossAxis: toValue(options.shiftCrossAxis),
      arrowSize: toValue(options.arrowSize),
      arrowElement,
      onRoom: options.onRoom,
    }),
  );

  const { floatingStyles, middlewareData, placement, isPositioned, update } =
    useFloating(reference, floating, {
      strategy: 'fixed',
      // Placed by its edges, not moved there by a transform: the popup grows
      // with \`scale\`, which a browser applies around the box before its
      // transform, at the window's corner.
      transform: false,
      open: options.open,
      placement: computed(() => kept.value ?? toValue(options.placement)),
      middleware,
      whileElementsMounted(anchor, element, performUpdate) {
        return autoUpdate(anchor, element, performUpdate, {
          animationFrame: false,
        });
      },
    });

  watch(isPositioned, (positioned) => {
    if (positioned && options.open.value && !kept.value)
      kept.value = placement.value;
  });

  const side = computed(() => popupSide(placement.value));
  const hidden = computed(() =>
    Boolean(middlewareData.value.hide?.referenceHidden),
  );
  const fit = computed(() => arrowFitOf(middlewareData.value));
  const arrowStyle = computed(() => {
    const size = toValue(options.arrowSize);
    return size
      ? popupArrowStyle(side.value, fit.value, size, options.border ?? 1)
      : undefined;
  });
  const origin = computed(() =>
    popupOrigin(side.value, fit.value, toValue(options.arrowSize) ?? 0),
  );

  return {
    floatingStyles,
    side,
    hidden,
    arrowStyle,
    origin,
    isPositioned,
    update,
  };
}
