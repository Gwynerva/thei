import { describe, expect, it } from 'vitest';
import { resolveEditorBlockMove } from '../../../app/composables/editor-block-drag';
import {
  editorPrivateSectionLayoutIsValid,
  editorPrivateSectionMoveIsValid,
} from '../../../app/composables/editor-private-sections';

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

  it('places the source before the block marked by the upper drop indicator', () => {
    const ids = ['first', 'middle', 'last'];
    const getIndex = (id: string) => ids.indexOf(id);

    expect(resolveEditorBlockMove('last', 'first', getIndex, 'before')).toEqual(
      {
        sourceIndex: 2,
        targetIndex: 0,
      },
    );
    expect(resolveEditorBlockMove('first', 'last', getIndex, 'before')).toEqual(
      {
        sourceIndex: 0,
        targetIndex: 1,
      },
    );
  });

  it('ignores adjacent, same, and missing blocks when the order is unchanged', () => {
    const ids = ['first', 'middle', 'last'];
    const getIndex = (id: string) => ids.indexOf(id);

    expect(resolveEditorBlockMove('middle', 'first', getIndex)).toBeUndefined();
    expect(resolveEditorBlockMove('last', 'middle', getIndex)).toBeUndefined();
    expect(
      resolveEditorBlockMove('first', 'middle', getIndex, 'before'),
    ).toBeUndefined();
    expect(
      resolveEditorBlockMove('middle', 'middle', getIndex),
    ).toBeUndefined();
    expect(resolveEditorBlockMove('removed', 'last', getIndex)).toBeUndefined();
    expect(
      resolveEditorBlockMove('first', 'removed', getIndex),
    ).toBeUndefined();
  });
});

describe('private section drag constraints', () => {
  const boundary = (id: string, sectionId: string) => ({ id, sectionId });

  it('allows the two boundaries of one pair to swap roles', () => {
    const blocks = [
      boundary('a-start', 'a'),
      { id: 'content' },
      boundary('a-end', 'a'),
    ];
    expect(editorPrivateSectionMoveIsValid(blocks, 2, 0)).toBe(true);
  });

  it('rejects moves that cross or nest stable pairs', () => {
    const blocks = [
      boundary('a-start', 'a'),
      { id: 'a-content' },
      boundary('a-end', 'a'),
      boundary('b-start', 'b'),
      { id: 'b-content' },
      boundary('b-end', 'b'),
    ];
    expect(editorPrivateSectionLayoutIsValid(blocks)).toBe(true);
    expect(editorPrivateSectionMoveIsValid(blocks, 2, 4)).toBe(false);
    expect(editorPrivateSectionMoveIsValid(blocks, 2, 5)).toBe(false);
  });

  it('allows ordinary content to move into and out of sections', () => {
    const blocks = [
      { id: 'outside' },
      boundary('start', 'section'),
      { id: 'inside' },
      boundary('end', 'section'),
    ];
    expect(editorPrivateSectionMoveIsValid(blocks, 0, 2)).toBe(true);
    expect(editorPrivateSectionMoveIsValid(blocks, 2, 0)).toBe(true);
  });
});
