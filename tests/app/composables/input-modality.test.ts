import { describe, expect, it } from 'vitest';
import {
  INITIAL_INPUT_MODALITY,
  isKeyboardFocus,
  nextInputModality,
  type InputModalityEvent,
} from '../../../app/composables/input-modality';

function after(...events: InputModalityEvent[]) {
  return events.reduce(nextInputModality, INITIAL_INPUT_MODALITY);
}

const key = (
  name: string,
  modifiers: Partial<Record<'ctrl' | 'meta' | 'alt', boolean>> = {},
): InputModalityEvent => ({
  type: 'key',
  key: name,
  ctrl: false,
  meta: false,
  alt: false,
  ...modifiers,
});

const pointer = (pointerType: string): InputModalityEvent => ({
  type: 'pointer',
  pointerType,
});

describe('isKeyboardFocus', () => {
  it('is the keyboard that moves the focus', () => {
    expect(isKeyboardFocus(after(key('Tab')))).toBe(true);
    expect(isKeyboardFocus(after(key('ArrowDown')))).toBe(true);
    expect(isKeyboardFocus(after(key('Shift'), key('Tab')))).toBe(true);
  });

  it('is not a pointer, nor nothing at all', () => {
    expect(isKeyboardFocus(INITIAL_INPUT_MODALITY)).toBe(false);
    expect(isKeyboardFocus(after(key('Tab'), pointer('mouse')))).toBe(false);
    expect(isKeyboardFocus(after(key('Tab'), pointer('touch')))).toBe(false);
  });

  it('is not a key that uses a control, whose menu may hand the focus back', () => {
    expect(isKeyboardFocus(after(key('Tab'), key('Enter')))).toBe(false);
    expect(isKeyboardFocus(after(key('Tab'), key('Escape')))).toBe(false);
    expect(isKeyboardFocus(after(key('Tab'), key(' ')))).toBe(false);
  });

  it('keeps what the last key did through modifiers and shortcuts', () => {
    expect(isKeyboardFocus(after(key('Tab'), key('Control')))).toBe(true);
    expect(isKeyboardFocus(after(key('Tab'), key('s', { ctrl: true })))).toBe(
      true,
    );
    expect(isKeyboardFocus(after(pointer('mouse'), key('Meta')))).toBe(false);
  });
});
