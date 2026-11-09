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

  /** Pastes text over the selection, as the browser does when let. */
  paste(text: string) {
    let prevented = false;
    this.dispatchEvent({
      type: 'paste',
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? text : ''),
      },
      preventDefault: () => {
        prevented = true;
      },
    });
    if (prevented) return;
    this.value =
      this.value.slice(0, this.selectionStart) +
      text +
      this.value.slice(this.selectionEnd);
    this.setSelectionRange(
      this.selectionStart + text.length,
      this.selectionStart + text.length,
    );
    this.dispatchEvent({ type: 'input', inputType: 'insertFromPaste' });
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

  it('formats a paste as it goes in, reading the words beside it', () => {
    element.type('Say ');
    element.paste('-- well... see https://a.b/c...d --flag');
    expect(element.value).toBe('Say — well… see https://a.b/c...d --flag');
    expect(element.selectionStart).toBe(element.value.length);
  });

  it('reads the letter before a paste, and leaves hyphens glued to it', () => {
    element.type('well');
    element.paste('-- known');
    expect(element.value).toBe('well-- known');
  });

  it('leaves a paste with nothing to format to the browser', () => {
    let inputs = 0;
    element.addEventListener('input', () => inputs++);
    element.paste('plain words');
    expect(element.value).toBe('plain words');
    expect(inputs).toBe(1);
  });

  it('gives a formatted paste nothing to take back by backspace', () => {
    element.paste('one --');
    expect(element.value).toBe('one —');
    element.backspace();
    expect(element.value).toBe('one ');
  });

  it('stops touching the field once released', () => {
    release();
    element.type('one --');
    expect(element.value).toBe('one --');
    element.paste(' and...');
    expect(element.value).toBe('one -- and...');
  });
});

describe('a password field', () => {
  it('is never bound: what is typed or pasted stays as it came', () => {
    const listened: string[] = [];
    const password = {
      type: 'password',
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      setSelectionRange() {},
      addEventListener: (type: string) => listened.push(type),
      removeEventListener() {},
    };
    const release = bindSmartTypography(
      password as unknown as HTMLInputElement,
    );
    expect(listened).toEqual([]);
    release();
  });
});
