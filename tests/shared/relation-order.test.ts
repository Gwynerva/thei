import { describe, expect, it } from 'vitest';
import {
  orderRelationsForEditing,
  type RelationEditItem,
} from '../../shared/relation';

const item = (
  entityType: RelationEditItem['entityType'],
  entityId: string,
  date?: string,
): RelationEditItem => ({
  entityType,
  entityId,
  type: 'related',
  ...(date ? { date } : {}),
});

const ids = (list: RelationEditItem[]) => list.map((entry) => entry.entityId);

describe('orderRelationsForEditing', () => {
  it('puts one kind after another, diary entries by their days, newest first', () => {
    const stored = [
      item('diary-entry', 'spring', '2024-04-01'),
      item('event', 'meeting'),
      item('project', 'second'),
      item('diary-entry', 'summer', '2024-07-01'),
      item('project', 'first'),
      item('event', 'launch'),
    ];
    expect(ids(orderRelationsForEditing(stored))).toEqual([
      'second',
      'first',
      'meeting',
      'launch',
      'summer',
      'spring',
    ]);
  });

  it('keeps the hand-made order of projects and events, and leaves its input alone', () => {
    const stored = [item('project', 'b'), item('project', 'a')];
    const copy = structuredClone(stored);
    expect(ids(orderRelationsForEditing(stored))).toEqual(['b', 'a']);
    expect(stored).toEqual(copy);
  });

  it('changes nothing in a list already in its order', () => {
    const ordered = orderRelationsForEditing([
      item('diary-entry', 'old', '2020-01-01'),
      item('event', 'e'),
      item('diary-entry', 'new', '2021-01-01'),
      item('project', 'p'),
    ]);
    expect(orderRelationsForEditing(ordered)).toEqual(ordered);
  });
});
