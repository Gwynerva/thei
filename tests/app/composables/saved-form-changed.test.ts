import { describe, expect, it } from 'vitest';
import { changedOnlyIn } from '../../../app/composables/saved-form';

const saved = JSON.stringify({
  title: 'Project',
  descriptionContent: { data: { blocks: [] } },
  stages: [
    { title: 'One', content: { data: { blocks: ['a'] } } },
    { title: 'Two', content: { data: { blocks: ['b'] } } },
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

  it('is true for a form that has not changed at all', () => {
    expect(changedOnlyIn(JSON.parse(saved), saved, FIELDS)).toBe(true);
  });

  it('refuses rather than guesses when the snapshot is unreadable', () => {
    expect(changedOnlyIn({}, 'not json', FIELDS)).toBe(false);
  });
});
