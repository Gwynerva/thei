import { beforeEach, describe, expect, it } from 'vitest';
import { bindSmartTypography } from '../../../app/composables/smart-typography';

/**
 * The binder talks to a field through a small part of the DOM API, so the test
 * gives it exactly that much and watches what it does with it. What is being
 * checked here is the behaviour around the replacement — when it fires, and
 * that backspace right after it gives back what was typed.
 */
class FakeField {
  value = '';
  selectionStart = 0;
  selectionEnd = 0;
  private listeners = new Map<string, ((event: any) => void)[]>();

  addEventListener(type: string, listener: (event: any) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    const list = (this.listeners.get(type) ?? []).filter(
      (item) => item !== listener,
    );
    this.listeners.set(type, list);
  }

  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  dispatchEvent(event: any) {
    for (const listener of this.listeners.get(event.type) ?? [])
      listener(event);
    return true;
  }

  /** Types text at the caret, the way a keyboard would. */
  type(text: string) {
    this.value =
      this.value.slice(0, this.selectionStart) +
      text +
      this.value.slice(this.selectionEnd);
    this.setSelectionRange(
      this.selectionStart + text.length,
      this.selectionStart + text.length,
    );
    this.dispatchEvent({ type: 'input', inputType: 'insertText' });
  }

  /** Presses backspace, honouring a handler that prevents the default. */
  backspace() {
    let prevented = false;
    this.dispatchEvent({
      type: 'beforeinput',
      inputType: 'deleteContentBackward',
      preventDefault: () => {
        prevented = true;
      },
    });
    if (prevented) return;
    this.value =
      this.value.slice(0, this.selectionStart - 1) +
      this.value.slice(this.selectionEnd);
    this.setSelectionRange(this.selectionStart - 1, this.selectionStart - 1);
    this.dispatchEvent({ type: 'input', inputType: 'deleteContentBackward' });
  }
}

function field() {
  return new FakeField() as unknown as FakeField & HTMLTextAreaElement;
}

describe('bindSmartTypography', () => {
  let element: FakeField & HTMLTextAreaElement;
  let release: () => void;

  beforeEach(() => {
    element = field();
    release = bindSmartTypography(element);
  });

  it('turns two hyphens into a dash as they are typed', () => {
    element.type('one ');
    element.type('-');
    element.type('-');
    expect(element.value).toBe('one —');
    expect(element.selectionStart).toBe(5);
  });

  it('gives the hyphens back when backspace follows immediately', () => {
    element.type('one --');
    expect(element.value).toBe('one —');
    element.backspace();
    expect(element.value).toBe('one --');
    expect(element.selectionStart).toBe(6);
  });

  it('deletes normally when backspace comes after something else', () => {
    element.type('one --');
    element.type('x');
    element.backspace();
    expect(element.value).toBe('one —');
  });

  it('turns three dots into an ellipsis', () => {
    element.type('Wait...');
    expect(element.value).toBe('Wait…');
  });

  it('leaves glued hyphens alone', () => {
    element.type('well--known');
    expect(element.value).toBe('well--known');
  });

  it('stops touching the field once released', () => {
    release();
    element.type('one --');
    expect(element.value).toBe('one --');
  });
});
