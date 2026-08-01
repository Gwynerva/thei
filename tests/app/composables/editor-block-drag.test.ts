import { describe, expect, it } from 'vitest';
import { resolveEditorBlockMove } from '../../../app/composables/editor-block-drag';

describe('Editor.js block drag helpers', () => {
  it('places the source after the block marked by the drop indicator', () => {
    const ids = ['first', 'middle', 'last'];
    const getIndex = (id: string) => ids.indexOf(id);

    expect(resolveEditorBlockMove('first', 'last', getIndex)).toEqual({
      sourceIndex: 0,
      targetIndex: 2,
    });
    expect(resolveEditorBlockMove('last', 'first', getIndex)).toEqual({
      sourceIndex: 2,
      targetIndex: 1,
    });
  });

  it('uses current indexes when order changes during a drag', () => {
    const ids = ['middle', 'last', 'first'];

    expect(
      resolveEditorBlockMove('first', 'middle', (id) => ids.indexOf(id)),
    ).toEqual({ sourceIndex: 2, targetIndex: 1 });
  });

  it('ignores adjacent, same, and missing blocks when the order is unchanged', () => {
    const ids = ['first', 'middle', 'last'];
    const getIndex = (id: string) => ids.indexOf(id);

    expect(resolveEditorBlockMove('middle', 'first', getIndex)).toBeUndefined();
    expect(resolveEditorBlockMove('last', 'middle', getIndex)).toBeUndefined();
    expect(
      resolveEditorBlockMove('middle', 'middle', getIndex),
    ).toBeUndefined();
    expect(resolveEditorBlockMove('removed', 'last', getIndex)).toBeUndefined();
    expect(
      resolveEditorBlockMove('first', 'removed', getIndex),
    ).toBeUndefined();
  });
});
