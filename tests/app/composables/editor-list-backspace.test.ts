import { describe, expect, it, vi } from 'vitest';
import {
  bindListBackspace,
  type ListTabulator,
} from '../../../app/composables/editor-list-backspace';

/** A holder that only hands its listeners back, and a list that takes keys. */
function listen(takes = true) {
  const listeners = new Map<string, (event: unknown) => void>();
  const holder = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
  } as unknown as HTMLElement;
  const backspace = vi.fn(
    (event: Pick<Event, 'stopPropagation' | 'preventDefault'>) => {
      if (takes) event.stopPropagation();
    },
  );
  bindListBackspace(holder, () => ({ backspace }) as unknown as ListTabulator);
  return { listeners, backspace };
}

function deletion(cancelable: boolean) {
  return {
    inputType: 'deleteContentBackward',
    cancelable,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('bindListBackspace', () => {
  it('puts a phone keyboard’s deletion to the list’s own Backspace', () => {
    const { listeners, backspace } = listen();
    const event = deletion(true);
    listeners.get('beforeinput')!(event);
    expect(backspace).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('leaves a deletion that cannot be stopped to the browser alone', () => {
    const { listeners, backspace } = listen();
    const event = deletion(false);
    listeners.get('beforeinput')!(event);
    expect(backspace).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves a real Backspace to the list’s keydown', () => {
    const { listeners, backspace } = listen();
    listeners.get('keydown')!({ key: 'Backspace' });
    listeners.get('beforeinput')!(deletion(true));
    expect(backspace).not.toHaveBeenCalled();
  });
});
