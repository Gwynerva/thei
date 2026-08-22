import { describe, expect, it, vi } from 'vitest';

const { sortableCreate, sortableDestroy } = vi.hoisted(() => ({
  sortableCreate: vi.fn(),
  sortableDestroy: vi.fn(),
}));

vi.mock('sortablejs', () => ({
  default: {
    create: sortableCreate.mockReturnValue({ destroy: sortableDestroy }),
  },
}));

import {
  applyDragTouchAction,
  createDragSort,
  moveItemById,
  moveItemToGroup,
} from '../../../app/composables/drag-sort';

function touchElement(initial = '', priority = '') {
  let value = initial;
  let currentPriority = priority;
  return {
    style: {
      getPropertyValue: () => value,
      getPropertyPriority: () => currentPriority,
      setProperty: (_property: string, next: string, nextPriority = '') => {
        value = next;
        currentPriority = nextPriority;
      },
      removeProperty: () => {
        const previous = value;
        value = '';
        currentPriority = '';
        return previous;
      },
    },
  };
}

describe('drag sort helpers', () => {
  const items = [
    { id: 'a', label: 'same' },
    { id: 'b', label: 'same' },
    { id: 'c', label: 'other' },
  ];

  it('uses the shared animated fallback behavior', () => {
    const root = {
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    const onDrop = vi.fn();

    const controller = createDragSort(root, { onDrop });

    expect(sortableCreate).toHaveBeenCalledWith(
      root,
      expect.objectContaining({
        animation: 180,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        forceFallback: true,
        draggable: '[data-drag-id]',
        handle: undefined,
        filter: '[data-drag-ignore]',
      }),
    );

    sortableDestroy.mockClear();
    controller.destroy();
    controller.destroy();
    expect(sortableDestroy).toHaveBeenCalledTimes(1);
  });

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

  it('disables touch panning on draggable items and restores inline styles', () => {
    const first = touchElement();
    const second = touchElement('pan-x', 'important');
    const root = {
      querySelectorAll: (selector: string) => {
        expect(selector).toBe('[data-drag-id]');
        return [first, second];
      },
    };

    const restore = applyDragTouchAction(root);
    expect(first.style.getPropertyValue()).toBe('none');
    expect(second.style.getPropertyValue()).toBe('none');

    restore();
    expect(first.style.getPropertyValue()).toBe('');
    expect(second.style.getPropertyValue()).toBe('pan-x');
    expect(second.style.getPropertyPriority()).toBe('important');
  });

  it('targets drag handles when a handle selector is configured', () => {
    const handle = touchElement('manipulation');
    const root = {
      querySelectorAll: (selector: string) => {
        expect(selector).toBe('[data-handle]');
        return [handle];
      },
    };

    const restore = applyDragTouchAction(root, '[data-handle]');
    expect(handle.style.getPropertyValue()).toBe('none');
    restore();
    expect(handle.style.getPropertyValue()).toBe('manipulation');
  });
});
