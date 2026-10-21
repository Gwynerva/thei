import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NativeUndoLedger,
  nativeEditKind,
} from '../../../app/composables/editor-native-undo';
import { historyKey } from '../../../app/composables/shortcut';

/**
 * The count of what the browser's Ctrl+Z may safely take back in the
 * editor: it errs low, so an undo may stop a step early, but never reaches
 * past a field changed behind the history's back.
 */
describe('NativeUndoLedger', () => {
  const field = {};
  const other = {};

  it('counts a run of typing at one place as one step', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('typing', field, { before: 0, after: 1 });
    ledger.edit('typing', field, { before: 1, after: 2 });
    ledger.edit('typing', field, { before: 2, after: 1 });
    expect(ledger.steps).toBe(1);
  });

  it('starts a new step where the caret moved or the field changed', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('typing', field, { before: 0, after: 1 });
    ledger.edit('typing', field, { before: 5, after: 6 });
    ledger.edit('typing', other, { before: 6, after: 7 });
    expect(ledger.steps).toBe(3);
  });

  it('lets a command’s own text join the typing before it', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('typing', field, { before: 0, after: 3 });
    ledger.edit('command-text', field, { before: undefined, after: 2 });
    expect(ledger.steps).toBe(1);
  });

  it('counts a move inside a field, its delete and its insert, once', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('drag-delete', field, { before: 4, after: 4 });
    ledger.edit('drop-insert', field, { before: 9, after: 9 });
    expect(ledger.steps).toBe(1);
    ledger.edit('drop-insert', field, { before: 2, after: 2 });
    expect(ledger.steps).toBe(2);
  });

  it('allows as many undos and redos as it counted', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('other', field, { before: 0, after: 1 });
    ledger.edit('other', field, { before: 1, after: 2 });
    expect(ledger.canUndo()).toBe(true);
    ledger.undone();
    ledger.undone();
    expect(ledger.canUndo()).toBe(false);
    expect(ledger.redoable).toBe(2);
    ledger.redone();
    expect(ledger.canRedo()).toBe(true);
    expect(ledger.steps).toBe(1);
  });

  it('forgets what could be redone once something new is written', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('other', field, { before: 0, after: 1 });
    ledger.undone();
    ledger.edit('typing', field, { before: 0, after: 1 });
    expect(ledger.canRedo()).toBe(false);
  });

  it('counts nothing before a fence', () => {
    const ledger = new NativeUndoLedger();
    ledger.edit('typing', field, { before: 0, after: 1 });
    ledger.edit('other', field, { before: 1, after: 2 });
    ledger.fence();
    expect(ledger.canUndo()).toBe(false);
    expect(ledger.canRedo()).toBe(false);
    ledger.edit('typing', field, { before: 1, after: 2 });
    expect(ledger.steps).toBe(1);
  });
});

describe('nativeEditKind', () => {
  it('tells typing, a drag and a command apart', () => {
    expect(nativeEditKind('insertText', true)).toBe('typing');
    expect(nativeEditKind('deleteContentBackward', true)).toBe('typing');
    expect(nativeEditKind('insertText', false)).toBe('command-text');
    expect(nativeEditKind('deleteByDrag', true)).toBe('drag-delete');
    expect(nativeEditKind('insertFromDrop', true)).toBe('drop-insert');
    expect(nativeEditKind('insertFromPaste', true)).toBe('other');
    expect(nativeEditKind('', false)).toBe('other');
  });
});

describe('historyKey', () => {
  afterEach(() => vi.unstubAllGlobals());

  const key = (init: Partial<KeyboardEvent>) =>
    historyKey({
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      keyCode: 0,
      code: '',
      ...init,
    } as KeyboardEvent);

  it('reads undo and redo by the key’s place, on any layout', () => {
    expect(key({ ctrlKey: true, code: 'KeyZ' })).toBe('undo');
    expect(key({ ctrlKey: true, shiftKey: true, code: 'KeyZ' })).toBe('redo');
    expect(key({ ctrlKey: true, code: 'KeyY' })).toBe('redo');
    expect(key({ code: 'KeyZ' })).toBeUndefined();
    expect(key({ ctrlKey: true, altKey: true, code: 'KeyZ' })).toBeUndefined();
  });

  it('takes the platform’s modifier, as every shortcut does', () => {
    expect(key({ metaKey: true, code: 'KeyZ' })).toBeUndefined();
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(key({ metaKey: true, code: 'KeyZ' })).toBe('undo');
    expect(key({ metaKey: true, shiftKey: true, code: 'KeyZ' })).toBe('redo');
    expect(key({ metaKey: true, code: 'KeyY' })).toBeUndefined();
    expect(key({ ctrlKey: true, code: 'KeyZ' })).toBeUndefined();
  });
});
