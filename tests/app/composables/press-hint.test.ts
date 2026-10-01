import { describe, expect, it } from 'vitest';
import {
  initialPressHint,
  PRESS_HINT_CONFIG,
  stepPressHint,
  type AnchorKind,
  type PointerKind,
  type PressHintAction,
  type PressHintConfig,
  type PressHintEvent,
  type PressHintHit,
  type PressHintTimer,
} from '../../../app/composables/press-hint';
import { innermostFirst } from '../../../app/composables/press-hint-dom';

type A = string;

const config: PressHintConfig = {
  ...PRESS_HINT_CONFIG,
  revealDelay: (_provider, source) => (source === 'hover' ? 400 : 300),
};

function hit(
  anchor: A,
  kind: AnchorKind = 'interactive',
  hasHint = true,
): PressHintHit<A> {
  return { anchor, provider: 'title', kind, hasHint };
}

/** An event inside `anchor`, or inside nothing. */
const inside =
  (anchor?: A) =>
  (candidate: A): boolean =>
    candidate === anchor;

/**
 * Drives the machine as the DOM adapter does, and checks after every step
 * what must always hold: one hint at most, a hint held up only by a long
 * press, and default actions prevented only where the model says.
 */
function machine() {
  let state = initialPressHint<A>();
  const timers = new Map<PressHintTimer, number>();
  let shown: { anchor: A; source: string; placement: string } | null = null;

  const preventable = new Set([
    'contextmenu',
    'selectstart',
    'dragstart',
    'click',
    'key',
  ]);

  function send(event: PressHintEvent<A>) {
    const before = state.press.phase;
    const result = stepPressHint(state, event, config);
    state = result.state;
    for (const action of result.actions) apply(action, event, before);
    return result.actions;
  }

  function apply(
    action: PressHintAction<A>,
    event: PressHintEvent<A>,
    before: string,
  ) {
    switch (action.type) {
      case 'show':
        expect(shown === null || shown.anchor === action.anchor).toBe(true);
        if (action.source === 'hold')
          expect(['armed'].includes(before)).toBe(true);
        shown = {
          anchor: action.anchor,
          source: action.source,
          placement: action.placement,
        };
        break;
      case 'hide':
        expect(shown?.anchor).toBe(action.anchor);
        shown = null;
        break;
      case 'startTimer':
        timers.set(action.name, action.ms);
        break;
      case 'clearTimer':
        timers.delete(action.name);
        break;
      case 'preventDefault':
      case 'stopPropagation':
        expect(preventable.has(event.type)).toBe(true);
        break;
    }
  }

  return {
    send,
    get state() {
      return state;
    },
    get shown() {
      return shown;
    },
    timer(name: PressHintTimer) {
      return timers.get(name);
    },
    fire(name: PressHintTimer) {
      expect(timers.has(name), `timer ${name} is running`).toBe(true);
      timers.delete(name);
      return send({ type: 'timer', name });
    },
    down(
      target: PressHintHit<A> | null,
      options: {
        id?: number;
        x?: number;
        y?: number;
        pointer?: PointerKind;
        primary?: boolean;
      } = {},
    ) {
      return send({
        type: 'down',
        pointer: options.pointer ?? 'touch',
        id: options.id ?? 1,
        primary: options.primary ?? true,
        x: options.x ?? 0,
        y: options.y ?? 0,
        hit: target,
      });
    },
    up(id = 1) {
      return send({ type: 'up', id });
    },
    click(anchor?: A) {
      return send({ type: 'click', within: inside(anchor) });
    },
    contextmenu(anchor?: A) {
      return send({ type: 'contextmenu', within: inside(anchor) });
    },
  };
}

const prevented = (actions: PressHintAction<A>[]) =>
  actions.some((action) => action.type === 'preventDefault');

describe('a finger on a link or a button', () => {
  it('acts on a tap and shows nothing', () => {
    const m = machine();
    m.down(hit('button'));
    expect(m.timer('hold')).toBe(500);
    m.up();
    expect(m.timer('hold')).toBeUndefined();
    expect(prevented(m.click('button'))).toBe(false);
    expect(m.shown).toBeNull();
  });

  it('shows the hint above the finger on a long press, and keeps the click', () => {
    const m = machine();
    m.down(hit('button'));
    m.fire('hold');
    expect(m.shown).toEqual({
      anchor: 'button',
      source: 'hold',
      placement: 'top',
    });
    expect(prevented(m.contextmenu('button'))).toBe(true);
    expect(prevented(m.send({ type: 'selectstart' }))).toBe(true);
    expect(prevented(m.send({ type: 'dragstart' }))).toBe(true);
    m.up();
    const click = m.click('button');
    expect(prevented(click)).toBe(true);
    expect(click.some((action) => action.type === 'stopPropagation')).toBe(
      true,
    );
    expect(m.shown?.anchor).toBe('button');
    // Only the one click that followed the press: the next is the button's.
    expect(prevented(m.click('button'))).toBe(false);
    expect(m.shown).toBeNull();
  });

  it('swallows a menu the system opens only on release', () => {
    const m = machine();
    m.down(hit('link'));
    m.fire('hold');
    m.up();
    expect(prevented(m.contextmenu('link'))).toBe(true);
    m.fire('guard');
    expect(prevented(m.click('link'))).toBe(false);
  });

  it('takes the system menu as the long press, and its timing from then on', () => {
    const m = machine();
    m.down(hit('link'));
    expect(prevented(m.contextmenu('link'))).toBe(true);
    expect(m.shown?.source).toBe('hold');
    expect(m.timer('hold')).toBeUndefined();
    expect(m.state.holdByTimer).toBe(false);
    m.up();
    m.down(hit('other'));
    expect(m.timer('hold')).toBeUndefined();
    expect(m.shown).toBeNull();
  });

  it('takes a word selected by the press as the long press', () => {
    const m = machine();
    m.down(hit('tab'));
    expect(prevented(m.send({ type: 'selectstart' }))).toBe(true);
    expect(m.shown?.source).toBe('hold');
  });

  it('leaves the second long press to the system, whose menu replaces the hint', () => {
    const m = machine();
    m.down(hit('link'));
    m.fire('hold');
    m.up();
    m.fire('guard');
    m.down(hit('link'), { id: 2 });
    expect(m.state.press.phase).toBe('native');
    expect(m.timer('hold')).toBeUndefined();
    expect(prevented(m.send({ type: 'selectstart' }))).toBe(false);
    expect(prevented(m.contextmenu('link'))).toBe(false);
    expect(m.shown).toBeNull();
  });

  it('acts on a tap on the anchor whose hint is up, and lets the hint go', () => {
    const m = machine();
    m.down(hit('button'));
    m.fire('hold');
    m.up();
    m.fire('guard');
    m.down(hit('button'), { id: 2 });
    m.up(2);
    expect(prevented(m.click('button'))).toBe(false);
    expect(m.shown).toBeNull();
  });

  it('lets go of the hint at a touch anywhere else', () => {
    const m = machine();
    m.down(hit('button'));
    m.fire('hold');
    m.up();
    m.down(null, { id: 2 });
    expect(m.shown).toBeNull();
    // The touch elsewhere also ends the guard: its click is its own.
    expect(prevented(m.click())).toBe(false);
  });

  it('gives up a press the finger drifts from, and keeps one it stays on', () => {
    const m = machine();
    m.down(hit('button'), { x: 100, y: 100 });
    m.send({ type: 'move', id: 1, x: 106, y: 104 });
    expect(m.state.press.phase).toBe('armed');
    m.send({ type: 'move', id: 1, x: 100, y: 120 });
    expect(m.state.press.phase).toBe('native');
    expect(m.timer('hold')).toBeUndefined();
    expect(prevented(m.contextmenu('button'))).toBe(false);
    expect(m.shown).toBeNull();
  });

  it('puts the hint away when the held finger moves on, as in a drag', () => {
    const m = machine();
    m.down(hit('chip'), { x: 0, y: 0 });
    m.fire('hold');
    m.send({ type: 'move', id: 1, x: 30, y: 0 });
    expect(m.shown).toBeNull();
    m.up();
    expect(prevented(m.click('chip'))).toBe(true);
  });

  it('keeps the hint when the system takes the press over', () => {
    const m = machine();
    m.down(hit('link'));
    m.fire('hold');
    m.send({ type: 'cancel', id: 1 });
    expect(m.shown?.anchor).toBe('link');
    expect(m.state.press.phase).toBe('idle');
    expect(prevented(m.contextmenu('link'))).toBe(true);
  });

  it('gives a pinch to the system', () => {
    const m = machine();
    m.down(hit('button'));
    m.down(hit('button'), { id: 2, primary: false });
    expect(m.state.press.phase).toBe('native');
    expect(m.timer('hold')).toBeUndefined();
    m.up(1);
    m.up(2);
    expect(m.shown).toBeNull();
    expect(m.state.press.phase).toBe('idle');
  });

  it('leaves a press of an anchor with nothing to show to the system', () => {
    const m = machine();
    m.down(hit('icon', 'interactive', false));
    expect(m.state.press.phase).toBe('native');
    expect(prevented(m.contextmenu('icon'))).toBe(false);
    expect(m.shown).toBeNull();
  });
});

describe('a finger on a thing without an action', () => {
  it('shows the hint on a tap, and hides it on the next', () => {
    const m = machine();
    m.down(hit('abbr', 'static'));
    m.up();
    expect(m.shown).toEqual({
      anchor: 'abbr',
      source: 'tap',
      placement: 'top',
    });
    // The click a tap makes on it changes nothing.
    expect(prevented(m.click('abbr'))).toBe(false);
    expect(m.shown?.anchor).toBe('abbr');
    m.down(hit('abbr', 'static'), { id: 2 });
    m.up(2);
    expect(m.shown).toBeNull();
  });

  it('leaves a long press on it to the system, for selecting text', () => {
    const m = machine();
    m.down(hit('abbr', 'static'));
    m.fire('hold');
    expect(m.state.press.phase).toBe('native');
    expect(prevented(m.send({ type: 'selectstart' }))).toBe(false);
    expect(prevented(m.contextmenu('abbr'))).toBe(false);
    m.up();
    expect(m.shown).toBeNull();
  });

  it('moves the hint from one to the next', () => {
    const m = machine();
    m.down(hit('first', 'static'));
    m.up();
    m.down(hit('second', 'static'), { id: 2 });
    expect(m.shown).toBeNull();
    m.up(2);
    expect(m.shown?.anchor).toBe('second');
  });
});

describe('a finger in a text field', () => {
  it('neither shows a hint nor holds anything back', () => {
    const m = machine();
    m.down(hit('input', 'field'));
    expect(m.state.press.phase).toBe('native');
    expect(m.timer('hold')).toBeUndefined();
    expect(prevented(m.contextmenu('input'))).toBe(false);
    m.up();
    expect(m.shown).toBeNull();
  });
});

describe('a hint a finger opened', () => {
  function held() {
    const m = machine();
    m.down(hit('button'));
    m.fire('hold');
    m.up();
    m.fire('guard');
    return m;
  }

  it('stays while its anchor stays, and goes once it scrolls away', () => {
    const m = held();
    m.send({ type: 'scroll', moved: () => false });
    expect(m.shown?.anchor).toBe('button');
    m.send({ type: 'scroll', moved: inside('button') });
    expect(m.shown).toBeNull();
  });

  it('goes with Escape and with anything that changes the page', () => {
    const escaped = held();
    escaped.send({
      type: 'key',
      key: 'escape',
      within: () => false,
      reachable: () => true,
    });
    expect(escaped.shown).toBeNull();
    expect(escaped.state.quiet).toBeNull();

    const dismissed = held();
    dismissed.send({ type: 'dismiss' });
    expect(dismissed.shown).toBeNull();
  });
});

describe('a mouse', () => {
  function hover(m: ReturnType<typeof machine>, anchor?: A, kind?: AnchorKind) {
    return m.send({
      type: 'hover',
      hit: anchor ? hit(anchor, kind) : null,
      within: inside(anchor),
    });
  }

  it('shows the hint after a pause, below, and takes it away on leaving', () => {
    const m = machine();
    hover(m, 'button');
    expect(m.timer('reveal')).toBe(400);
    m.fire('reveal');
    expect(m.shown).toEqual({
      anchor: 'button',
      source: 'hover',
      placement: 'bottom',
    });
    hover(m);
    expect(m.shown).toBeNull();
  });

  it('cancels a hint not yet shown when it moves on', () => {
    const m = machine();
    hover(m, 'button');
    hover(m);
    expect(m.timer('reveal')).toBeUndefined();
  });

  it('moves a hint that is up to the next anchor quickly', () => {
    const m = machine();
    hover(m, 'first');
    m.fire('reveal');
    hover(m, 'second');
    expect(m.timer('reveal')).toBe(60);
    m.fire('reveal');
    expect(m.shown?.anchor).toBe('second');
  });

  it('hides the hint of what it presses until it leaves it', () => {
    const m = machine();
    hover(m, 'menu');
    m.fire('reveal');
    m.down(hit('menu'), { pointer: 'mouse' });
    expect(m.shown).toBeNull();
    hover(m, 'menu');
    expect(m.timer('reveal')).toBeUndefined();
    hover(m, 'elsewhere', 'static');
    hover(m, 'menu');
    expect(m.timer('reveal')).toBe(400);
  });

  it('shows hints of text fields too', () => {
    const m = machine();
    hover(m, 'input', 'field');
    m.fire('reveal');
    expect(m.shown?.anchor).toBe('input');
  });
});

describe('the keyboard', () => {
  function focus(m: ReturnType<typeof machine>, anchor: A, keyboard = true) {
    return m.send({ type: 'focus', hit: hit(anchor), keyboard });
  }

  function blur(m: ReturnType<typeof machine>, to?: A) {
    return m.send({ type: 'blur', stillWithin: inside(to) });
  }

  function key(
    m: ReturnType<typeof machine>,
    which: 'escape' | 'activate',
    target?: A,
    reachable = true,
  ) {
    return m.send({
      type: 'key',
      key: which,
      within: inside(target),
      reachable: () => reachable,
    });
  }

  it('shows the hint of where it moves the focus, and not of a focus it did not move', () => {
    const m = machine();
    focus(m, 'button', false);
    expect(m.timer('reveal')).toBeUndefined();
    focus(m, 'button');
    expect(m.timer('reveal')).toBe(300);
    m.fire('reveal');
    expect(m.shown).toEqual({
      anchor: 'button',
      source: 'focus',
      placement: 'bottom',
    });
    blur(m);
    expect(m.shown).toBeNull();
  });

  it('takes the hint away with Escape first, and keeps it away while the focus stays', () => {
    const m = machine();
    focus(m, 'button');
    m.fire('reveal');
    const escape = key(m, 'escape', 'button');
    expect(prevented(escape)).toBe(true);
    expect(m.shown).toBeNull();
    focus(m, 'button');
    expect(m.timer('reveal')).toBeUndefined();
    // The next Escape is for whatever is behind the hint.
    expect(prevented(key(m, 'escape', 'button'))).toBe(false);
    blur(m);
    focus(m, 'button');
    expect(m.timer('reveal')).toBe(300);
  });

  it('leaves Escape alone for a hint a modal shuts out', () => {
    const m = machine();
    focus(m, 'button');
    m.fire('reveal');
    expect(prevented(key(m, 'escape', 'button', false))).toBe(false);
    expect(m.shown?.anchor).toBe('button');
  });

  it('puts the hint away when the control is used, so it never covers its menu', () => {
    const m = machine();
    focus(m, 'menu');
    m.fire('reveal');
    expect(prevented(key(m, 'activate', 'menu'))).toBe(false);
    expect(m.shown).toBeNull();
    focus(m, 'menu');
    expect(m.timer('reveal')).toBeUndefined();
  });

  it('cancels a hint not shown yet when the control is used', () => {
    const m = machine();
    focus(m, 'menu');
    key(m, 'activate', 'menu');
    expect(m.timer('reveal')).toBeUndefined();
  });
});

describe('dismiss', () => {
  it('ends a press in progress and every timer', () => {
    const m = machine();
    m.down(hit('button'));
    m.send({ type: 'dismiss' });
    expect(m.timer('hold')).toBeUndefined();
    expect(m.state.press.phase).toBe('native');
    m.up();
    expect(m.state.press.phase).toBe('idle');
    expect(m.shown).toBeNull();
  });
});

describe('innermostFirst', () => {
  it('puts the anchor held by the others first', () => {
    // A chip holding an icon holding a dot.
    const tree: Record<string, string | undefined> = {
      dot: 'icon',
      icon: 'chip',
      chip: undefined,
    };
    const contains = (outer: string, inner: string) => {
      for (let node = tree[inner]; node; node = tree[node])
        if (node === outer) return true;
      return false;
    };
    expect(innermostFirst(['chip', 'dot', 'icon'], contains)).toEqual([
      'dot',
      'icon',
      'chip',
    ]);
  });
});
