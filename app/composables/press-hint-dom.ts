import {
  initialPressHint,
  PRESS_HINT_CONFIG,
  stepPressHint,
  type AnchorKind,
  type HintPlacement,
  type HintSource,
  type PointerKind,
  type PressHintAction,
  type PressHintConfig,
  type PressHintEvent,
  type PressHintHit,
  type PressHintTimer,
} from './press-hint';
import { installInputModality, isKeyboardFocus } from './input-modality';

/**
 * The browser's side of `press-hint.ts`: one set of listeners on the window
 * for every hint on the page, title popups and link cards alike, each kind
 * registered as a provider. Only pointer events are read — never the mouse
 * events a browser makes up after a tap, which would make every tap look
 * like pointing.
 */

/**
 * Something that shows hints: it finds its anchor from where an event
 * happened, says whether there is anything to show for it, and shows it.
 */
export type PressHintProvider = {
  id: string;
  /** Its anchor at or around `target`, or `null`. */
  anchorFor(target: Element): HTMLElement | null;
  hasHint(anchor: HTMLElement): boolean;
  show(
    anchor: HTMLElement,
    how: { source: HintSource; placement: HintPlacement },
  ): void;
  hide(anchor: HTMLElement): void;
  /** Whether a node is in its own popup, which is not "elsewhere". */
  owns?(node: Node): boolean;
  /** How long it waits to show a hint pointed at or focused, in ms. */
  delays?: { hover?: number; focus?: number };
};

export type PressHints = {
  register(provider: PressHintProvider): () => void;
  /** Takes every hint away, as a change of page does. */
  dismiss(): void;
  dispose(): void;
};

/** Set on an anchor while a finger opened its hint, for `main.css`. */
export const PRESS_HINT_OPEN_ATTRIBUTE = 'data-title-popup-open';

/**
 * What a tap acts on: links and controls, by their tags and roles. Not by
 * `tabindex` — an icon may take the focus only to show its hint by it.
 * `data-title-popup-press="hold"` marks one whose action is a script's.
 */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'summary',
  'label',
  'select',
  'input:not([type="hidden"])',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  '[role="slider"]',
  '[role="treeitem"]',
  '[data-title-popup-press="hold"]',
].join(', ');

/** Where a finger places a caret: a long press there pastes. */
export const FIELD_SELECTOR = [
  'textarea',
  'input:not([type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"])',
].join(', ');

/** What a touch at `target` inside `anchor` means. */
export function classifyAnchor(target: Element, anchor: Element): AnchorKind {
  const press = anchor.getAttribute('data-title-popup-press');
  if (press === 'tap') return 'static';
  if (
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest(FIELD_SELECTOR)
  )
    return 'field';
  if (press === 'hold') return 'interactive';
  const control = target.closest(INTERACTIVE_SELECTOR);
  if (!control) return 'static';
  // A disabled control does nothing when tapped: its hint is what is left.
  if (
    control.matches(':disabled') ||
    control.getAttribute('aria-disabled') === 'true'
  )
    return 'static';
  return 'interactive';
}

/**
 * The anchors found around one point, innermost first: an icon with its own
 * hint inside a chip with another is the icon's. `contains(outer, inner)`
 * tells which holds which.
 */
export function innermostFirst<T>(
  anchors: readonly T[],
  contains: (outer: T, inner: T) => boolean,
): T[] {
  return [...anchors].sort((left, right) =>
    left === right
      ? 0
      : contains(left, right)
        ? 1
        : contains(right, left)
          ? -1
          : 0,
  );
}

function pointerKind(type: string): PointerKind {
  return type === 'touch' || type === 'pen' ? type : 'mouse';
}

function elementOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

const TOUCH_SOURCES: readonly HintSource[] = ['hold', 'tap'];

export function installPressHints(win: Window & typeof globalThis): PressHints {
  const doc = win.document;
  const providers = new Map<string, PressHintProvider>();
  const modality = installInputModality(win);
  const timers = new Map<PressHintTimer, ReturnType<typeof setTimeout>>();
  let state = initialPressHint<HTMLElement>();
  /** Where a hint a finger opened was, to tell when its anchor scrolls. */
  let shownAt: DOMRect | undefined;
  let moveListening = false;
  let scrollListening = false;

  const config: PressHintConfig = {
    ...PRESS_HINT_CONFIG,
    revealDelay: (id, source) => providers.get(id)?.delays?.[source] ?? 400,
  };

  function owned(node: Node) {
    for (const provider of providers.values())
      if (provider.owns?.(node)) return true;
    return false;
  }

  function resolveHit(target: Element): PressHintHit<HTMLElement> | null {
    const found: { anchor: HTMLElement; provider: PressHintProvider }[] = [];
    for (const provider of providers.values()) {
      const anchor = provider.anchorFor(target);
      if (anchor) found.push({ anchor, provider });
    }
    if (!found.length) return null;
    const ordered = innermostFirst(found, (outer, inner) =>
      outer.anchor.contains(inner.anchor),
    );
    // An anchor with nothing to say right now — a name not cut short —
    // gives way to the one around it.
    const chosen =
      ordered.find(({ anchor, provider }) => provider.hasHint(anchor)) ??
      undefined;
    const { anchor, provider } = chosen ?? ordered[0]!;
    return {
      anchor,
      provider: provider.id,
      kind: classifyAnchor(target, anchor),
      hasHint: Boolean(chosen),
    };
  }

  function perform(action: PressHintAction<HTMLElement>, event?: Event) {
    switch (action.type) {
      case 'show': {
        const touch = TOUCH_SOURCES.includes(action.source);
        if (touch) {
          action.anchor.setAttribute(PRESS_HINT_OPEN_ATTRIBUTE, '');
          shownAt = action.anchor.getBoundingClientRect();
        } else shownAt = undefined;
        // The system's own long press buzzes; the one taken from it should
        // too. Without a tap on the page first, the browser refuses, loudly.
        if (
          action.source === 'hold' &&
          win.navigator.userActivation?.hasBeenActive
        )
          win.navigator.vibrate?.(10);
        providers.get(action.provider)?.show(action.anchor, {
          source: action.source,
          placement: action.placement,
        });
        break;
      }
      case 'hide':
        action.anchor.removeAttribute(PRESS_HINT_OPEN_ATTRIBUTE);
        shownAt = undefined;
        providers.get(action.provider)?.hide(action.anchor);
        break;
      case 'startTimer': {
        const running = timers.get(action.name);
        if (running !== undefined) clearTimeout(running);
        timers.set(
          action.name,
          setTimeout(() => {
            timers.delete(action.name);
            dispatch({ type: 'timer', name: action.name });
          }, action.ms),
        );
        break;
      }
      case 'clearTimer': {
        const running = timers.get(action.name);
        if (running !== undefined) clearTimeout(running);
        timers.delete(action.name);
        break;
      }
      case 'preventDefault':
        event?.preventDefault();
        break;
      case 'stopPropagation':
        event?.stopImmediatePropagation();
        break;
    }
  }

  function dispatch(event: PressHintEvent<HTMLElement>, domEvent?: Event) {
    const result = stepPressHint(state, event, config);
    state = result.state;
    for (const action of result.actions) perform(action, domEvent);
    syncListeners();
  }

  function within(target: Node | null) {
    return (anchor: HTMLElement) => Boolean(target && anchor.contains(target));
  }

  /** Whether Escape can reach an anchor: not shut out by a modal over it. */
  function reachable(anchor: HTMLElement) {
    if (!anchor.isConnected || anchor.closest('[inert]')) return false;
    let modals: NodeListOf<HTMLDialogElement>;
    try {
      modals = doc.querySelectorAll<HTMLDialogElement>('dialog:modal');
    } catch {
      return true;
    }
    const top = modals[modals.length - 1];
    return !top || top.contains(anchor);
  }

  function onPointerOver(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    // A pen touching the screen draws or presses; only one held above it
    // points.
    if (event.pointerType === 'pen' && event.buttons) return;
    const target = elementOf(event.target);
    if (!target) return;
    dispatch({
      type: 'hover',
      hit: owned(target) ? null : resolveHit(target),
      within: within(target),
    });
  }

  function onPointerOut(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.relatedTarget !== null) return;
    // The pointer left the window.
    dispatch({ type: 'hover', hit: null, within: () => false });
  }

  function onPointerDown(event: PointerEvent) {
    const target = elementOf(event.target);
    if (!target || owned(target)) return;
    dispatch(
      {
        type: 'down',
        pointer: pointerKind(event.pointerType),
        id: event.pointerId,
        primary: event.isPrimary,
        x: event.clientX,
        y: event.clientY,
        hit: resolveHit(target),
      },
      event,
    );
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    dispatch({
      type: 'move',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    dispatch({ type: 'up', id: event.pointerId }, event);
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    dispatch({ type: 'cancel', id: event.pointerId });
  }

  /** A slider that captures the finger has taken the press over. */
  function onGotPointerCapture(event: PointerEvent) {
    const press = state.press;
    if (press.phase === 'idle' || press.phase === 'native') return;
    if (press.id !== event.pointerId) return;
    const target = elementOf(event.target);
    if (target && press.hit.anchor.contains(target)) return;
    dispatch({ type: 'cancel', id: event.pointerId });
  }

  function onContextMenu(event: MouseEvent) {
    dispatch(
      { type: 'contextmenu', within: within(elementOf(event.target)) },
      event,
    );
  }

  function pressing() {
    return state.press.phase === 'armed' || state.press.phase === 'held';
  }

  function onSelectStart(event: Event) {
    if (pressing()) dispatch({ type: 'selectstart' }, event);
  }

  function onDragStart(event: DragEvent) {
    if (pressing()) dispatch({ type: 'dragstart' }, event);
  }

  function onClick(event: MouseEvent) {
    dispatch({ type: 'click', within: within(elementOf(event.target)) }, event);
  }

  function onFocusIn(event: FocusEvent) {
    const target = elementOf(event.target);
    if (!target) return;
    dispatch({
      type: 'focus',
      hit: owned(target) ? null : resolveHit(target),
      keyboard: isKeyboardFocus(modality.state),
    });
  }

  function onFocusOut(event: FocusEvent) {
    const next =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;
    dispatch({ type: 'blur', stillWithin: within(next) });
  }

  function onKeyDown(event: KeyboardEvent) {
    const key =
      event.key === 'Escape'
        ? 'escape'
        : event.key === 'Enter' || event.key === ' '
          ? 'activate'
          : undefined;
    if (!key || event.isComposing) return;
    dispatch(
      {
        type: 'key',
        key,
        within: within(elementOf(event.target)),
        reachable,
      },
      event,
    );
  }

  function onScroll() {
    const before = shownAt;
    dispatch({
      type: 'scroll',
      moved: (anchor) => {
        if (!before) return false;
        const now = anchor.getBoundingClientRect();
        return (
          Math.abs(now.top - before.top) > 1 ||
          Math.abs(now.left - before.left) > 1
        );
      },
    });
  }

  function onVisibilityChange() {
    if (doc.visibilityState === 'hidden') dispatch({ type: 'dismiss' });
  }

  /** Moves are only read while a finger presses; scrolls while it shows. */
  function syncListeners() {
    const press = state.press.phase;
    const wantMove =
      press === 'armed' || press === 'tapping' || press === 'held';
    if (wantMove !== moveListening) {
      moveListening = wantMove;
      if (wantMove)
        win.addEventListener('pointermove', onPointerMove, { capture: true });
      else
        win.removeEventListener('pointermove', onPointerMove, {
          capture: true,
        });
    }
    const wantScroll = Boolean(
      state.shown && TOUCH_SOURCES.includes(state.shown.source),
    );
    if (wantScroll !== scrollListening) {
      scrollListening = wantScroll;
      const viewport = win.visualViewport;
      if (wantScroll) {
        win.addEventListener('scroll', onScroll, { capture: true });
        viewport?.addEventListener('scroll', onScroll);
        viewport?.addEventListener('resize', onScroll);
      } else {
        win.removeEventListener('scroll', onScroll, { capture: true });
        viewport?.removeEventListener('scroll', onScroll);
        viewport?.removeEventListener('resize', onScroll);
      }
    }
  }

  const listeners: [string, EventListener, AddEventListenerOptions][] = [
    [
      'pointerover',
      onPointerOver as EventListener,
      { capture: true, passive: true },
    ],
    [
      'pointerout',
      onPointerOut as EventListener,
      { capture: true, passive: true },
    ],
    [
      'pointerdown',
      onPointerDown as EventListener,
      { capture: true, passive: true },
    ],
    [
      'pointerup',
      onPointerUp as EventListener,
      { capture: true, passive: true },
    ],
    [
      'pointercancel',
      onPointerCancel as EventListener,
      { capture: true, passive: true },
    ],
    [
      'gotpointercapture',
      onGotPointerCapture as EventListener,
      { capture: true, passive: true },
    ],
    ['contextmenu', onContextMenu as EventListener, { capture: true }],
    ['selectstart', onSelectStart, { capture: true }],
    ['dragstart', onDragStart as EventListener, { capture: true }],
    ['click', onClick as EventListener, { capture: true }],
    ['focusin', onFocusIn as EventListener, { capture: true }],
    ['focusout', onFocusOut as EventListener, { capture: true }],
    ['keydown', onKeyDown as EventListener, { capture: true }],
  ];
  for (const [type, listener, options] of listeners)
    win.addEventListener(type, listener, options);
  doc.addEventListener('visibilitychange', onVisibilityChange);

  return {
    register(provider) {
      providers.set(provider.id, provider);
      return () => {
        if (providers.get(provider.id) !== provider) return;
        if (
          state.shown?.provider === provider.id ||
          state.pending?.provider === provider.id
        )
          dispatch({ type: 'dismiss' });
        providers.delete(provider.id);
      };
    },
    dismiss() {
      dispatch({ type: 'dismiss' });
    },
    dispose() {
      dispatch({ type: 'dismiss' });
      for (const [type, listener, options] of listeners)
        win.removeEventListener(type, listener, options);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      state = { ...state, press: { phase: 'idle' } };
      syncListeners();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      modality.dispose();
      providers.clear();
    },
  };
}

let instance: PressHints | undefined;

/** The page's one set of hint listeners, installed on first use. */
export function usePressHints(): PressHints | undefined {
  if (typeof window === 'undefined') return undefined;
  instance ??= installPressHints(window);
  return instance;
}

/** Takes every hint away: a drag has begun, or the page changed under it. */
export function dismissPressHints() {
  instance?.dismiss();
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    instance?.dispose();
    instance = undefined;
  });
