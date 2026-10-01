/**
 * When a hint shows: the decisions behind the title popups and the link
 * cards, kept free of Vue and the DOM so every gesture can be tested as a
 * sequence of events. `press-hint-dom.ts` feeds it what the browser reports
 * and carries out what it answers.
 *
 * A mouse or a pen points at a thing and gets its hint after a pause, and
 * pressing it hides the hint until the pointer leaves, as a native `title`
 * does, so a hint never covers the menu its button opens. The keyboard gets
 * the hint of whatever it moves the focus to, and Escape takes it away first.
 *
 * A finger has no pointing, only taps and presses, so what it gets depends on
 * what is under it:
 *
 * - On a link or a button a tap is the action and never shows anything. The
 *   first long press shows the hint above the finger, and keeps everything
 *   else the press would do — the click on release, the system menu, a text
 *   selection. A second long press on it while the hint is up is the
 *   system's again, so its menu stays one press away.
 * - On a thing that does nothing when tapped — a hint in the text, a status
 *   icon, a date — a tap shows the hint and another hides it; a long press
 *   is left to the system, which selects text with it.
 * - In a text field a tap places the caret and a long press pastes: neither
 *   shows a hint.
 * - Where there is no hint, or none to show right now, nothing is held back.
 *
 * A hint a finger opened goes away with a touch elsewhere, when its anchor
 * scrolls away, and with anything that changes the page under it.
 */

export type PointerKind = 'mouse' | 'pen' | 'touch';

/**
 * What a touch on an anchor means: `interactive` when the touch lands on a
 * link or a control, `static` when the anchor does nothing of its own, and
 * `field` for text fields and editable text.
 */
export type AnchorKind = 'interactive' | 'static' | 'field';

/** What opened a hint: pointing, the keyboard, a long press or a tap. */
export type HintSource = 'hover' | 'focus' | 'hold' | 'tap';

/** Where the hint goes: above a finger, which would cover it below. */
export type HintPlacement = 'top' | 'bottom';

export type PressHintTimer = 'reveal' | 'hold' | 'guard';

/** An anchor found under the pointer or the focus. */
export type PressHintHit<A> = {
  anchor: A;
  provider: string;
  kind: AnchorKind;
  /** Whether there is anything to show for it now. */
  hasHint: boolean;
};

/** Whether the event happened inside an anchor. */
export type Within<A> = (anchor: A) => boolean;

export type PressHintConfig = {
  /** How long a provider waits before showing a hint pointed at or focused. */
  revealDelay(provider: string, source: 'hover' | 'focus'): number;
  /** The pause before a hint already up moves to the next anchor. */
  switchDelay: number;
  /** How long a finger stays down before the press is a long one. */
  holdDelay: number;
  /** How far a finger may drift and still be pressing, in CSS pixels. */
  slop: number;
  /** How long after a long press its late click and menu are swallowed. */
  guardDelay: number;
};

export const PRESS_HINT_CONFIG: Omit<PressHintConfig, 'revealDelay'> = {
  // Hit-testing at an element's edge can flip between two anchors; the pause
  // keeps a hint that is up from flickering between them.
  switchDelay: 60,
  holdDelay: 500,
  slop: 10,
  guardDelay: 700,
};

export type PressHintEvent<A> =
  /** A mouse or a pen came over something; `null` when it left the window. */
  | { type: 'hover'; hit: PressHintHit<A> | null; within: Within<A> }
  | {
      type: 'down';
      pointer: PointerKind;
      id: number;
      primary: boolean;
      x: number;
      y: number;
      hit: PressHintHit<A> | null;
    }
  | { type: 'move'; id: number; x: number; y: number }
  | { type: 'up'; id: number }
  /** The press was taken over: a scroll, a pointer capture, a drag. */
  | { type: 'cancel'; id?: number }
  | { type: 'contextmenu'; within: Within<A> }
  | { type: 'selectstart' }
  | { type: 'dragstart' }
  | { type: 'click'; within: Within<A> }
  | { type: 'focus'; hit: PressHintHit<A> | null; keyboard: boolean }
  /** The focus left; `stillWithin` tells where it went. */
  | { type: 'blur'; stillWithin: Within<A> }
  | {
      type: 'key';
      key: 'escape' | 'activate';
      /** Whether the key was pressed inside an anchor. */
      within: Within<A>;
      /** Whether Escape can reach an anchor's hint: not under a modal. */
      reachable: Within<A>;
    }
  | { type: 'scroll'; moved: Within<A> }
  | { type: 'dismiss' }
  | { type: 'timer'; name: PressHintTimer };

export type PressHintAction<A> =
  | {
      type: 'show';
      anchor: A;
      provider: string;
      source: HintSource;
      placement: HintPlacement;
    }
  | { type: 'hide'; anchor: A; provider: string }
  | { type: 'startTimer'; name: PressHintTimer; ms: number }
  | { type: 'clearTimer'; name: PressHintTimer }
  | { type: 'preventDefault' }
  | { type: 'stopPropagation' };

type Shown<A> = {
  anchor: A;
  provider: string;
  source: HintSource;
  kind: AnchorKind;
};

type Pending<A> = {
  anchor: A;
  provider: string;
  source: 'hover' | 'focus';
  kind: AnchorKind;
};

export type PressState<A> =
  | { phase: 'idle' }
  /** A finger on a link or control with a hint, not yet a long press. */
  | { phase: 'armed'; id: number; hit: PressHintHit<A>; x: number; y: number }
  /** A finger on a thing with a hint and no action, not yet lifted. */
  | {
      phase: 'tapping';
      id: number;
      hit: PressHintHit<A>;
      x: number;
      y: number;
    }
  /** A long press that showed a hint, with the finger still down. */
  | { phase: 'held'; id: number; hit: PressHintHit<A>; x: number; y: number }
  /** A press the system has, which this leaves alone until it ends. */
  | { phase: 'native'; id: number };

export type PressHintState<A> = {
  shown: Shown<A> | null;
  pending: Pending<A> | null;
  press: PressState<A>;
  /** An anchor whose hint stays away until the pointer or focus leaves it. */
  quiet: { anchor: A; until: 'pointer-leaves' | 'focus-leaves' } | null;
  /** The anchor of a long press just released: its late click is not one. */
  guard: A | null;
  /**
   * Whether a long press is timed here. A browser that sends `contextmenu`
   * while the finger is down says when a press is long by itself, by the
   * person's own setting, and the timer is no longer needed.
   */
  holdByTimer: boolean;
};

export function initialPressHint<A>(): PressHintState<A> {
  return {
    shown: null,
    pending: null,
    press: { phase: 'idle' },
    quiet: null,
    guard: null,
    holdByTimer: true,
  };
}

const TOUCH_SOURCES: readonly HintSource[] = ['hold', 'tap'];

function isTouchHint<A>(shown: Shown<A> | null): shown is Shown<A> {
  return Boolean(shown && TOUCH_SOURCES.includes(shown.source));
}

function quietAfterEscape<A>(shown: Shown<A>): PressHintState<A>['quiet'] {
  if (TOUCH_SOURCES.includes(shown.source)) return null;
  return {
    anchor: shown.anchor,
    until: shown.source === 'focus' ? 'focus-leaves' : 'pointer-leaves',
  };
}

export function stepPressHint<A>(
  previous: PressHintState<A>,
  event: PressHintEvent<A>,
  config: PressHintConfig,
): { state: PressHintState<A>; actions: PressHintAction<A>[] } {
  const state: PressHintState<A> = { ...previous };
  const actions: PressHintAction<A>[] = [];

  function hide() {
    if (!state.shown) return;
    actions.push({
      type: 'hide',
      anchor: state.shown.anchor,
      provider: state.shown.provider,
    });
    state.shown = null;
  }

  function show(
    target: { anchor: A; provider: string; kind: AnchorKind },
    source: HintSource,
  ) {
    if (state.shown && state.shown.anchor !== target.anchor) hide();
    state.shown = {
      anchor: target.anchor,
      provider: target.provider,
      source,
      kind: target.kind,
    };
    actions.push({
      type: 'show',
      anchor: target.anchor,
      provider: target.provider,
      source,
      placement: TOUCH_SOURCES.includes(source) ? 'top' : 'bottom',
    });
  }

  function clearPending() {
    if (!state.pending) return;
    actions.push({ type: 'clearTimer', name: 'reveal' });
    state.pending = null;
  }

  function reveal(
    target: { anchor: A; provider: string; kind: AnchorKind },
    source: 'hover' | 'focus',
  ) {
    clearPending();
    const delay = state.shown
      ? config.switchDelay
      : config.revealDelay(target.provider, source);
    if (delay <= 0) {
      show(target, source);
      return;
    }
    state.pending = { ...target, source };
    actions.push({ type: 'startTimer', name: 'reveal', ms: delay });
  }

  function clearGuard() {
    if (state.guard === null) return;
    actions.push({ type: 'clearTimer', name: 'guard' });
    state.guard = null;
  }

  function guard(anchor: A) {
    state.guard = anchor;
    actions.push({ type: 'startTimer', name: 'guard', ms: config.guardDelay });
  }

  function endPress(next: PressState<A>) {
    const phase = state.press.phase;
    if (phase === 'armed' || phase === 'tapping')
      actions.push({ type: 'clearTimer', name: 'hold' });
    state.press = next;
  }

  function prevent() {
    actions.push({ type: 'preventDefault' });
  }

  function holdShows(press: Extract<PressState<A>, { phase: 'armed' }>) {
    actions.push({ type: 'clearTimer', name: 'hold' });
    show(press.hit, 'hold');
    state.press = { ...press, phase: 'held' };
  }

  switch (event.type) {
    case 'hover': {
      if (state.quiet?.until === 'pointer-leaves') {
        if (event.within(state.quiet.anchor)) break;
        state.quiet = null;
      }
      const hit = event.hit?.hasHint ? event.hit : null;
      if (!hit) {
        if (state.pending?.source === 'hover') clearPending();
        if (state.shown?.source === 'hover') hide();
        break;
      }
      if (hit.anchor === state.shown?.anchor) {
        if (state.pending?.source === 'hover') clearPending();
        break;
      }
      if (hit.anchor === state.pending?.anchor) break;
      reveal(hit, 'hover');
      break;
    }

    case 'down': {
      clearGuard();
      if (event.pointer !== 'touch') {
        // Pressing a thing with the mouse or a pen is using it: its hint
        // goes, and stays away until the pointer leaves it.
        clearPending();
        hide();
        state.quiet = event.hit
          ? { anchor: event.hit.anchor, until: 'pointer-leaves' }
          : null;
        break;
      }
      if (state.press.phase !== 'idle') {
        // A second finger: a pinch or a zoom, never a press of either.
        if (state.press.phase !== 'native')
          endPress({ phase: 'native', id: state.press.id });
        break;
      }
      if (!event.primary) break;
      const hit = event.hit;
      // A touch anywhere else lets go of the hint that is up.
      if (state.shown && state.shown.anchor !== hit?.anchor) hide();
      clearPending();
      state.quiet = null;
      if (!hit || hit.kind === 'field' || !hit.hasHint) {
        state.press = { phase: 'native', id: event.id };
        break;
      }
      const position = { id: event.id, hit, x: event.x, y: event.y };
      if (hit.kind === 'static') {
        state.press = { phase: 'tapping', ...position };
        actions.push({
          type: 'startTimer',
          name: 'hold',
          ms: config.holdDelay,
        });
        break;
      }
      // The second long press on an anchor whose hint is up is the
      // system's; a tap on it is still its action.
      if (isTouchHint(state.shown) && state.shown.anchor === hit.anchor) {
        state.press = { phase: 'native', id: event.id };
        break;
      }
      state.press = { phase: 'armed', ...position };
      if (state.holdByTimer)
        actions.push({
          type: 'startTimer',
          name: 'hold',
          ms: config.holdDelay,
        });
      break;
    }

    case 'move': {
      const press = state.press;
      if (press.phase === 'idle' || press.phase === 'native') break;
      if (press.id !== event.id) break;
      if (Math.hypot(event.x - press.x, event.y - press.y) <= config.slop)
        break;
      if (press.phase === 'held') {
        // The finger moves on with what it held — a drag or a scroll.
        hide();
        guard(press.hit.anchor);
      }
      endPress({ phase: 'native', id: press.id });
      break;
    }

    case 'up': {
      const press = state.press;
      if (press.phase === 'idle' || press.id !== event.id) break;
      if (press.phase === 'tapping') {
        if (state.shown?.anchor === press.hit.anchor) hide();
        else show(press.hit, 'tap');
      }
      if (press.phase === 'held') guard(press.hit.anchor);
      endPress({ phase: 'idle' });
      break;
    }

    case 'cancel': {
      const press = state.press;
      if (press.phase === 'idle') break;
      if (event.id !== undefined && press.id !== event.id) break;
      // Whatever took the press over — a scroll, a drag, the system's own
      // long press — no click follows it, but a late menu might.
      if (press.phase === 'held') guard(press.hit.anchor);
      endPress({ phase: 'idle' });
      break;
    }

    case 'timer': {
      if (event.name === 'reveal') {
        const pending = state.pending;
        if (!pending) break;
        state.pending = null;
        show(pending, pending.source);
        break;
      }
      if (event.name === 'guard') {
        state.guard = null;
        break;
      }
      const press = state.press;
      if (press.phase === 'armed') holdShows(press);
      // A long press on text is for selecting it.
      else if (press.phase === 'tapping')
        state.press = { phase: 'native', id: press.id };
      break;
    }

    case 'contextmenu': {
      const press = state.press;
      if (press.phase === 'armed') {
        // The system says the press is long before the timer does: it is
        // the one to listen to from now on.
        prevent();
        state.holdByTimer = false;
        holdShows(press);
        break;
      }
      if (press.phase === 'held') {
        prevent();
        break;
      }
      if (state.guard !== null && event.within(state.guard)) {
        // Some systems open the menu of a long press on release.
        prevent();
        break;
      }
      // The second long press: the system menu opens, the hint makes room.
      if (isTouchHint(state.shown) && event.within(state.shown.anchor)) hide();
      break;
    }

    case 'selectstart': {
      const press = state.press;
      if (press.phase === 'armed') {
        // A word gets selected on a long press before the menu is asked for.
        prevent();
        holdShows(press);
      } else if (press.phase === 'held') prevent();
      break;
    }

    case 'dragstart': {
      if (state.press.phase === 'armed' || state.press.phase === 'held')
        prevent();
      break;
    }

    case 'click': {
      if (state.guard !== null && event.within(state.guard)) {
        prevent();
        actions.push({ type: 'stopPropagation' });
        clearGuard();
        break;
      }
      // A tap on a link or control whose hint is up does what it does,
      // and the hint goes.
      if (
        isTouchHint(state.shown) &&
        state.shown.kind === 'interactive' &&
        event.within(state.shown.anchor)
      )
        hide();
      break;
    }

    case 'focus': {
      const hit = event.hit;
      if (!event.keyboard || !hit?.hasHint) break;
      if (
        state.quiet?.until === 'focus-leaves' &&
        state.quiet.anchor === hit.anchor
      )
        break;
      if (hit.anchor === state.shown?.anchor) break;
      if (hit.anchor === state.pending?.anchor) break;
      reveal(hit, 'focus');
      break;
    }

    case 'blur': {
      if (
        state.pending?.source === 'focus' &&
        !event.stillWithin(state.pending.anchor)
      )
        clearPending();
      if (
        state.shown?.source === 'focus' &&
        !event.stillWithin(state.shown.anchor)
      )
        hide();
      if (
        state.quiet?.until === 'focus-leaves' &&
        !event.stillWithin(state.quiet.anchor)
      )
        state.quiet = null;
      break;
    }

    case 'key': {
      if (event.key === 'activate') {
        // A control used from the keyboard opens what it opens; its hint
        // would sit on top of it.
        const anchor = state.shown?.anchor ?? state.pending?.anchor;
        if (anchor === undefined || !event.within(anchor)) break;
        clearPending();
        hide();
        state.quiet = { anchor, until: 'focus-leaves' };
        break;
      }
      const shown = state.shown;
      if (shown && event.reachable(shown.anchor)) {
        // Escape takes the hint away before it closes anything else.
        prevent();
        actions.push({ type: 'stopPropagation' });
        clearPending();
        hide();
        state.quiet = quietAfterEscape(shown);
        break;
      }
      clearPending();
      break;
    }

    case 'scroll': {
      // A hint the pointer or the keyboard holds follows its anchor; one a
      // finger opened is left behind once the anchor moves.
      if (isTouchHint(state.shown) && event.moved(state.shown.anchor)) hide();
      break;
    }

    case 'dismiss': {
      clearPending();
      hide();
      clearGuard();
      const press = state.press;
      if (press.phase !== 'idle' && press.phase !== 'native')
        endPress({ phase: 'native', id: press.id });
      state.quiet = null;
      break;
    }
  }

  return { state, actions };
}
