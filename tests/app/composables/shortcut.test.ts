import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, defineComponent } from 'vue';
import { modalStack } from '../../../app/composables/modal';
import {
  isEditableTarget,
  isMacPlatform,
  isModalOpen,
  matchChord,
  matchSlash,
  useShortcut,
} from '../../../app/composables/shortcut';
import type { ActiveModal } from '../../../app/modals/types';

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    altKey: false,
    code: '',
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    key: '',
    keyCode: 0,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    target: null,
    getModifierState: () => false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

const ctrlK = (overrides: Partial<KeyboardEvent> = {}) =>
  key({ code: 'KeyK', ctrlKey: true, key: 'k', ...overrides });

/**
 * The element `#target` of `html`, as far as `closest` goes: the selectors
 * are matched by a real engine, on real markup.
 */
function inside(html: string): EventTarget {
  const element = load(html)('#target');
  return {
    closest: (selector: string) => element.closest(selector).get(0) ?? null,
  } as unknown as EventTarget;
}

/** A page whose `<dialog open>` elements are `dialogs`. */
function stubDocument(dialogs: Partial<HTMLElement>[]) {
  vi.stubGlobal('document', {
    querySelectorAll: (selector: string) => {
      const found = selector === 'dialog[open]' ? dialogs : [];
      return { length: found.length, item: (index: number) => found[index] };
    },
  });
}

const dialog = (display = ''): Partial<HTMLElement> => ({
  hidden: false,
  isConnected: true,
  parentElement: null,
  style: { display } as CSSStyleDeclaration,
});

beforeEach(() => vi.stubGlobal('navigator', { platform: 'Win32' }));
afterEach(() => {
  modalStack.value = [];
  vi.unstubAllGlobals();
});

describe('the platform', () => {
  it('is a Mac by the client hints first, then by navigator.platform', () => {
    expect(isMacPlatform()).toBe(false);
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(isMacPlatform()).toBe(true);
    vi.stubGlobal('navigator', { platform: 'iPad' });
    expect(isMacPlatform()).toBe(true);
    vi.stubGlobal('navigator', {
      platform: '',
      userAgentData: { platform: 'macOS' },
    });
    expect(isMacPlatform()).toBe(true);
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgentData: { platform: 'Windows' },
    });
    expect(isMacPlatform()).toBe(false);
  });

  it('is not a Mac on the server', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isMacPlatform()).toBe(false);
  });
});

describe('a chord', () => {
  it('is the physical key, whatever the layout types on it', () => {
    // Ctrl+K on a Russian layout types «л».
    expect(matchChord(ctrlK({ key: 'л' }), { code: 'KeyK' })).toBe(true);
    expect(matchChord(ctrlK({ code: 'KeyV' }), { code: 'KeyK' })).toBe(false);
  });

  it('takes Ctrl elsewhere and Cmd on a Mac, never the other one too', () => {
    const chord = { code: 'KeyK' };
    expect(matchChord(ctrlK(), chord)).toBe(true);
    expect(matchChord(ctrlK({ ctrlKey: false, metaKey: true }), chord)).toBe(
      false,
    );
    expect(matchChord(ctrlK({ metaKey: true }), chord)).toBe(false);

    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(matchChord(ctrlK({ ctrlKey: false, metaKey: true }), chord)).toBe(
      true,
    );
    expect(matchChord(ctrlK(), chord)).toBe(false);
    expect(matchChord(ctrlK({ metaKey: true }), chord)).toBe(false);
    expect(matchChord(ctrlK({ ctrlKey: false }), chord)).toBe(false);
  });

  it('wants Shift exactly as the chord says', () => {
    const slash = key({ code: 'Slash', ctrlKey: true, key: '/' });
    const question = key({ code: 'Slash', ctrlKey: true, shiftKey: true });
    expect(matchChord(question, { code: 'Slash', shift: true })).toBe(true);
    expect(matchChord(slash, { code: 'Slash', shift: true })).toBe(false);
    expect(matchChord(question, { code: 'Slash' })).toBe(false);
  });

  it('is not pressed with Alt, nor with AltGr, which reads as Ctrl+Alt', () => {
    const chord = { code: 'KeyK' };
    expect(matchChord(ctrlK({ altKey: true }), chord)).toBe(false);
    expect(
      matchChord(
        ctrlK({
          altKey: true,
          getModifierState: (name: string) => name === 'AltGraph',
        }),
        chord,
      ),
    ).toBe(false);
    expect(
      matchChord(
        ctrlK({ getModifierState: (name: string) => name === 'AltGraph' }),
        chord,
      ),
    ).toBe(false);
  });

  it('is not a key an input method is putting together', () => {
    expect(matchChord(ctrlK({ isComposing: true }), { code: 'KeyK' })).toBe(
      false,
    );
    expect(matchChord(ctrlK({ keyCode: 229 }), { code: 'KeyK' })).toBe(false);
  });
});

describe('the slash', () => {
  it('is "/" by its character, on whatever key and with Shift or not', () => {
    expect(matchSlash(key({ code: 'Slash', key: '/' }))).toBe(true);
    // German: Shift+7; Russian: Shift+\.
    expect(matchSlash(key({ code: 'Digit7', key: '/', shiftKey: true }))).toBe(
      true,
    );
    expect(
      matchSlash(key({ code: 'Backslash', key: '/', shiftKey: true })),
    ).toBe(true);
  });

  it('is the key of "/" in the Russian layout of Windows, which types "."', () => {
    expect(matchSlash(key({ code: 'Slash', key: '.' }))).toBe(true);
  });

  it('is not what that key types on other layouts', () => {
    // German "-", French "!".
    expect(matchSlash(key({ code: 'Slash', key: '-' }))).toBe(false);
    expect(matchSlash(key({ code: 'Slash', key: '!' }))).toBe(false);
  });

  it('is not "?", nor pressed with a modifier, nor being composed', () => {
    expect(matchSlash(key({ code: 'Slash', key: '?', shiftKey: true }))).toBe(
      false,
    );
    const slash = { code: 'Slash', key: '/' };
    expect(matchSlash(key({ ...slash, ctrlKey: true }))).toBe(false);
    expect(matchSlash(key({ ...slash, metaKey: true }))).toBe(false);
    expect(matchSlash(key({ ...slash, altKey: true }))).toBe(false);
    expect(
      matchSlash(
        key({
          ...slash,
          getModifierState: (name: string) => name === 'AltGraph',
        }),
      ),
    ).toBe(false);
    expect(matchSlash(key({ ...slash, isComposing: true }))).toBe(false);
    expect(matchSlash(key({ ...slash, keyCode: 229 }))).toBe(false);
  });
});

describe('an editable target', () => {
  it('is a field typed into, or the text of an editor', () => {
    expect(isEditableTarget(inside('<input id="target">'))).toBe(true);
    expect(isEditableTarget(inside('<input id="target" type="search">'))).toBe(
      true,
    );
    expect(isEditableTarget(inside('<textarea id="target"></textarea>'))).toBe(
      true,
    );
    expect(isEditableTarget(inside('<select id="target"></select>'))).toBe(
      true,
    );
    expect(
      isEditableTarget(inside('<div id="target" contenteditable></div>')),
    ).toBe(true);
    expect(
      isEditableTarget(
        inside('<div contenteditable="true"><p><b id="target"></b></p></div>'),
      ),
    ).toBe(true);
  });

  it('is not what says it is not editable, nor a control that is pressed', () => {
    expect(
      isEditableTarget(
        inside('<div id="target" contenteditable="false"></div>'),
      ),
    ).toBe(false);
    for (const type of ['checkbox', 'radio', 'button', 'range', 'file'])
      expect(
        isEditableTarget(inside(`<input id="target" type="${type}">`)),
      ).toBe(false);
    expect(isEditableTarget(inside('<button id="target"></button>'))).toBe(
      false,
    );
  });

  it('is not a target that is no element at all', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
});

describe('a modal in front', () => {
  it('is a modal on the stack', () => {
    expect(isModalOpen()).toBe(false);
    modalStack.value = [{ id: 1 } as ActiveModal];
    expect(isModalOpen()).toBe(true);
  });

  it('is a dialog open and on show on the page', () => {
    stubDocument([]);
    expect(isModalOpen()).toBe(false);
    stubDocument([dialog('none')]);
    expect(isModalOpen()).toBe(false);
    stubDocument([dialog()]);
    expect(isModalOpen()).toBe(true);
  });

  it('is the dialog an event came from', () => {
    stubDocument([]);
    const target = inside('<dialog><button id="target"></button></dialog>');
    expect(isModalOpen(key({ target }))).toBe(true);
    expect(isModalOpen(key({ target: inside('<p id="target"></p>') }))).toBe(
      false,
    );
  });
});

describe('useShortcut', () => {
  type Listener = (event: KeyboardEvent) => void;
  let listeners: Map<Listener, boolean | undefined>;
  const mounted: (() => void)[] = [];

  beforeEach(() => {
    listeners = new Map();
    vi.stubGlobal('window', {
      addEventListener: (_: string, listener: Listener, capture?: boolean) =>
        listeners.set(listener, capture),
      removeEventListener: (_: string, listener: Listener) =>
        listeners.delete(listener),
    });
  });
  afterEach(() => {
    while (mounted.length) mounted.pop()!();
  });

  /** Mounts a component that uses the shortcut; returns its unmount. */
  function mount(...args: Parameters<typeof useShortcut>) {
    const node = () => ({});
    const { createApp } = createRenderer<object, object>({
      createElement: node,
      createText: node,
      createComment: node,
      insert() {},
      remove() {},
      patchProp() {},
      setText() {},
      setElementText() {},
      parentNode: () => null,
      nextSibling: () => null,
    });
    const app = createApp(
      defineComponent({
        setup() {
          useShortcut(...args);
          return () => null;
        },
      }),
    );
    app.mount({});
    let unmounted = false;
    const unmount = () => {
      if (unmounted) return;
      unmounted = true;
      app.unmount();
    };
    mounted.push(unmount);
    return unmount;
  }

  function press(event: KeyboardEvent) {
    for (const listener of listeners.keys()) listener(event);
    return event;
  }

  const isCtrlK = (event: KeyboardEvent) => matchChord(event, { code: 'KeyK' });

  it('takes its keys from the browser while mounted, and lets go after', () => {
    const handler = vi.fn();
    const unmount = mount(isCtrlK, handler, { capture: true });
    expect([...listeners.values()]).toEqual([true]);

    const event = press(ctrlK());
    expect(handler).toHaveBeenCalledWith(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    press(key({ code: 'KeyK', key: 'k' }));
    expect(handler).toHaveBeenCalledOnce();

    unmount();
    expect(listeners.size).toBe(0);
  });

  it('leaves a key already taken, and acts once for a key held down', () => {
    const handler = vi.fn();
    mount(isCtrlK, handler);

    const taken = press(ctrlK({ defaultPrevented: true }));
    expect(taken.preventDefault).not.toHaveBeenCalled();
    const repeat = press(ctrlK({ repeat: true }));
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves typing in a field alone, unless let in', () => {
    const handler = vi.fn();
    mount(isCtrlK, handler);
    const event = press(ctrlK({ target: inside('<input id="target">') }));
    expect(handler).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();

    mount(isCtrlK, handler, { allowInEditable: true });
    press(ctrlK({ target: inside('<input id="target">') }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('leaves the key to the browser while a modal is in front, unless let in', () => {
    const handler = vi.fn();
    mount(isCtrlK, handler);
    modalStack.value = [{ id: 1 } as ActiveModal];
    const event = press(ctrlK());
    expect(handler).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();

    mount(isCtrlK, handler, { allowInModal: true });
    press(ctrlK());
    expect(handler).toHaveBeenCalledOnce();
  });
});
