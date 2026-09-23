import { describe, expect, it } from 'vitest';
import {
  changedOnlyIn,
  stampSavedContent,
} from '../../../app/composables/saved-form';

const saved = JSON.stringify({
  title: 'Project',
  descriptionContent: { data: { blocks: [] } },
  stages: [
    { title: 'One', isPrivate: false, content: { data: { blocks: ['a'] } } },
    { title: 'Two', isPrivate: false, content: { data: { blocks: ['b'] } } },
  ],
});

const FIELDS = ['content', 'descriptionContent', 'notes'];

describe('changedOnlyIn', () => {
  it('accepts a change confined to a content field', () => {
    const current = JSON.parse(saved);
    current.descriptionContent = { data: { blocks: ['new'] } };
    expect(changedOnlyIn(current, saved, FIELDS)).toBe(true);
  });

  it('accepts a change to the content of a stage several levels down', () => {
    const current = JSON.parse(saved);
    current.stages[1].content = { data: { blocks: ['edited'] } };
    expect(changedOnlyIn(current, saved, FIELDS)).toBe(true);
  });

  it('refuses when anything outside the content fields differs', () => {
    const current = JSON.parse(saved);
    current.stages[0].title = 'Renamed';
    current.stages[1].content = { data: { blocks: ['edited'] } };
    expect(changedOnlyIn(current, saved, FIELDS)).toBe(false);
  });

  it('refuses when an item was added, even with the same content', () => {
    const current = JSON.parse(saved);
    current.stages.push({ title: 'Three', content: null });
    expect(changedOnlyIn(current, saved, FIELDS)).toBe(false);
  });

  it('ignores the order of keys in an item rebuilt elsewhere', () => {
    // A stage handed back by its modal lists its fields in another order.
    const current = JSON.parse(saved);
    current.stages[1] = {
      content: { data: { blocks: ['edited'] } },
      isPrivate: false,
      title: 'Two',
    };
    expect(changedOnlyIn(current, saved, FIELDS)).toBe(true);
  });

  it('is true for a form that has not changed at all', () => {
    expect(changedOnlyIn(JSON.parse(saved), saved, FIELDS)).toBe(true);
  });

  it('refuses rather than guesses when the snapshot is unreadable', () => {
    expect(changedOnlyIn({}, 'not json', FIELDS)).toBe(false);
  });
});

describe('stampSavedContent', () => {
  const blocks = (text: string) => ({
    blocks: [{ type: 'paragraph', data: { text } }],
  });

  it('stamps only the content that differs from the last save', () => {
    const saved = {
      title: 'Project',
      content: { data: blocks('old'), updatedAt: 1 },
      notes: { data: blocks('same'), updatedAt: 2 },
    };
    const current = structuredClone(saved);
    current.content.data = blocks('new');
    stampSavedContent(current, JSON.stringify(saved), ['content', 'notes'], 9);
    expect(current.content.updatedAt).toBe(9);
    expect(current.notes.updatedAt).toBe(2);
  });

  it('matches list items by public ID, not by position', () => {
    const saved = {
      stages: [
        { publicId: 'A', content: { data: blocks('a'), updatedAt: 1 } },
        { publicId: 'B', content: { data: blocks('b'), updatedAt: 1 } },
      ],
    };
    const current = structuredClone(saved);
    current.stages.reverse();
    current.stages[1]!.content.data = blocks('a, edited');
    stampSavedContent(current, JSON.stringify(saved), ['content'], 9);
    expect(current.stages.map((stage) => stage.content.updatedAt)).toEqual([
      1, 9,
    ]);
  });

  it('stamps content that did not exist at the last save', () => {
    const current = { content: { data: blocks('first words') } } as {
      content: { data: unknown; updatedAt?: number };
    };
    stampSavedContent(
      current,
      JSON.stringify({ content: null }),
      ['content'],
      9,
    );
    expect(current.content.updatedAt).toBe(9);
  });
});
