import { describe, expect, it, vi } from 'vitest';
import {
  createSaveShortcutRegistry,
  isSaveShortcut,
} from '../../../app/composables/save-shortcut';

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    altKey: false,
    code: 'KeyS',
    ctrlKey: true,
    isComposing: false,
    key: 'ы',
    metaKey: false,
    repeat: false,
    shiftKey: false,
    target: null,
    getModifierState: () => false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

interface TestElement extends Partial<HTMLElement> {
  parentElement: TestElement | null;
}

function element(parentElement: TestElement | null = null) {
  const root: TestElement = {
    hidden: false,
    isConnected: true,
    parentElement,
    style: { display: '' } as CSSStyleDeclaration,
    closest: (selector: string) => {
      if (selector !== 'dialog') return null;
      let current: TestElement | null = root;
      while (current) {
        if ((current as { dialog?: boolean }).dialog) return current;
        current = current.parentElement;
      }
      return null;
    },
    contains: (candidate: Node | null) => {
      let current = candidate as unknown as TestElement | null;
      while (current) {
        if (current === root) return true;
        current = current.parentElement;
      }
      return false;
    },
  };
  return root as HTMLElement;
}

describe('save shortcut recognition', () => {
  it('uses the physical S key for Ctrl and Cmd regardless of layout', () => {
    expect(isSaveShortcut(key({ key: 'ы' }))).toBe(true);
    expect(
      isSaveShortcut(key({ ctrlKey: false, key: 'ß', metaKey: true })),
    ).toBe(true);
  });

  it('rejects conflicting modifiers, composition, and other physical keys', () => {
    expect(isSaveShortcut(key({ shiftKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ altKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ ctrlKey: true, metaKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ isComposing: true }))).toBe(false);
    expect(isSaveShortcut(key({ code: 'KeyP' }))).toBe(false);
    expect(
      isSaveShortcut(key({ getModifierState: (name) => name === 'AltGraph' })),
    ).toBe(false);
  });
});

describe('save shortcut ownership', () => {
  it('uses the most specific element scope and returns to its parent', () => {
    const page = element();
    const child = element(page as unknown as TestElement);
    const target = element(child as unknown as TestElement);
    const registry = createSaveShortcutRegistry();
    const pageSave = vi.fn();
    const childSave = vi.fn();
    registry.register(pageSave, { root: page });
    const unregisterChild = registry.register(childSave, { root: child });

    registry.handle(key({ target }));
    expect(childSave).toHaveBeenCalledOnce();
    expect(pageSave).not.toHaveBeenCalled();

    unregisterChild();
    registry.handle(key({ target }));
    expect(pageSave).toHaveBeenCalledOnce();
  });

  it('gives the active modal priority over a global page handler', () => {
    const dialog = element() as HTMLElement & { dialog: boolean };
    dialog.dialog = true;
    const modal = element(dialog as unknown as TestElement);
    const target = element(dialog as unknown as TestElement);
    const registry = createSaveShortcutRegistry({
      getActiveBoundary: () => dialog,
    });
    const pageSave = vi.fn();
    const modalSave = vi.fn();
    registry.register(pageSave);
    registry.register(modalSave, { root: modal, exclusive: true });

    registry.handle(key({ target }));
    expect(modalSave).toHaveBeenCalledOnce();
    expect(pageSave).not.toHaveBeenCalled();
  });

  it('uses the top visible nested modal and returns to its parent', () => {
    const dialog = element() as HTMLElement & { dialog: boolean };
    dialog.dialog = true;
    const parent = element(dialog as unknown as TestElement);
    const child = element(dialog as unknown as TestElement);
    const parentTarget = element(parent as unknown as TestElement);
    const childTarget = element(child as unknown as TestElement);
    const registry = createSaveShortcutRegistry({
      getActiveBoundary: () => dialog,
    });
    const parentSave = vi.fn();
    const childSave = vi.fn();
    registry.register(parentSave, { root: parent, exclusive: true });
    const unregisterChild = registry.register(childSave, {
      root: child,
      exclusive: true,
    });

    parent.style.display = 'none';
    registry.handle(key({ target: childTarget }));
    expect(childSave).toHaveBeenCalledOnce();
    expect(parentSave).not.toHaveBeenCalled();

    unregisterChild();
    parent.style.display = '';
    registry.handle(key({ target: parentTarget }));
    expect(parentSave).toHaveBeenCalledOnce();
  });

  it('does not fall through an unavailable modal or suppress the browser', () => {
    const dialog = element() as HTMLElement & { dialog: boolean };
    dialog.dialog = true;
    const modal = element(dialog as unknown as TestElement);
    const event = key({ target: modal });
    const registry = createSaveShortcutRegistry({
      getActiveBoundary: () => dialog,
    });
    const pageSave = vi.fn();
    const modalSave = vi.fn();
    registry.register(pageSave);
    registry.register(modalSave, {
      canSave: false,
      root: modal,
      exclusive: true,
    });

    registry.handle(event);
    expect(modalSave).not.toHaveBeenCalled();
    expect(pageSave).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('blocks the background page when the top modal has no handler', () => {
    const dialog = element() as HTMLElement & { dialog: boolean };
    dialog.dialog = true;
    const event = key({ target: dialog });
    const registry = createSaveShortcutRegistry({
      getActiveBoundary: () => dialog,
    });
    const pageSave = vi.fn();
    registry.register(pageSave);

    registry.handle(event);
    expect(pageSave).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores repeats and concurrent async saves', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const save = vi.fn(() => pending);
    const registry = createSaveShortcutRegistry();
    registry.register(save);

    registry.handle(key());
    registry.handle(key());
    registry.handle(key({ repeat: true }));
    expect(save).toHaveBeenCalledOnce();

    finish();
    await pending;
    await Promise.resolve();
    registry.handle(key({ repeat: true }));
    expect(save).toHaveBeenCalledOnce();
  });
});
