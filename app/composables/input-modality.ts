/**
 * Whether the focus that just moved was moved by the keyboard.
 *
 * `:focus-visible` cannot say it for a text field, which matches it however
 * it was focused, nor for a control focused by a script after a key — a menu
 * closing hands the focus back to its button. What counts is the last thing
 * the person did: a press of a pointer, or a key that moves the focus.
 */

export type InputModality = 'keyboard' | 'mouse' | 'pen' | 'touch' | 'none';

export type InputModalityState = {
  modality: InputModality;
  /** The last key that counted, or `null` after a pointer. */
  lastKey: string | null;
};

export type InputModalityEvent =
  | { type: 'key'; key: string; ctrl: boolean; meta: boolean; alt: boolean }
  | { type: 'pointer'; pointerType: string };

/** The keys that move the focus, and so may bring a hint with them. */
const NAVIGATION_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'F6',
]);

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'AltGraph',
]);

export const INITIAL_INPUT_MODALITY: InputModalityState = {
  modality: 'none',
  lastKey: null,
};

export function nextInputModality(
  state: InputModalityState,
  event: InputModalityEvent,
): InputModalityState {
  if (event.type === 'pointer') {
    const modality =
      event.pointerType === 'mouse' ||
      event.pointerType === 'pen' ||
      event.pointerType === 'touch'
        ? event.pointerType
        : 'none';
    return { modality, lastKey: null };
  }
  // A modifier held for a shortcut, or the shortcut itself, moves nothing.
  if (MODIFIER_KEYS.has(event.key)) return state;
  if (event.ctrl || event.meta || event.alt) return state;
  return { modality: 'keyboard', lastKey: event.key };
}

export function isKeyboardFocus(state: InputModalityState) {
  return (
    state.modality === 'keyboard' &&
    state.lastKey !== null &&
    NAVIGATION_KEYS.has(state.lastKey)
  );
}

/** Follows the window's keys and pointers, ahead of everything else. */
export function installInputModality(win: Window) {
  let state = INITIAL_INPUT_MODALITY;
  const onKeydown = (event: KeyboardEvent) => {
    state = nextInputModality(state, {
      type: 'key',
      key: event.key,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      alt: event.altKey,
    });
  };
  const onPointerdown = (event: PointerEvent) => {
    state = nextInputModality(state, {
      type: 'pointer',
      pointerType: event.pointerType,
    });
  };
  win.addEventListener('keydown', onKeydown, true);
  win.addEventListener('pointerdown', onPointerdown, true);
  return {
    get state() {
      return state;
    },
    dispose() {
      win.removeEventListener('keydown', onKeydown, true);
      win.removeEventListener('pointerdown', onPointerdown, true);
    },
  };
}
