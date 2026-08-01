import { describe, expect, it } from 'vitest';
import {
  moveItemById,
  moveItemToGroup,
} from '../../../app/composables/drag-sort';

describe('drag sort helpers', () => {
  const items = [
    { id: 'a', label: 'same' },
    { id: 'b', label: 'same' },
    { id: 'c', label: 'other' },
  ];

  it('moves forward and backward by stable ID', () => {
    expect(
      moveItemById(items, 'a', 2, (item) => item.id).map((item) => item.id),
    ).toEqual(['b', 'c', 'a']);
    expect(
      moveItemById(items, 'c', 0, (item) => item.id).map((item) => item.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('keeps order for a no-op or unknown ID', () => {
    expect(moveItemById(items, 'b', 1, (item) => item.id)).toEqual(items);
    expect(moveItemById(items, 'missing', 0, (item) => item.id)).toEqual(items);
  });

  it('moves items between ordered groups, including an empty group', () => {
    const grouped = [
      { id: 'a', group: 'first' as const },
      { id: 'b', group: 'second' as const },
    ];
    const result = moveItemToGroup(
      grouped,
      'b',
      'third',
      0,
      ['first', 'second', 'third'] as const,
      (item) => item.id,
      (item) => item.group,
      (item, group) => ({ ...item, group }),
    );
    expect(result).toEqual([
      { id: 'a', group: 'first' },
      { id: 'b', group: 'third' },
    ]);
  });
});
