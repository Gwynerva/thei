import { describe, expect, it } from 'vitest';
import { relationFromEnd } from '../../shared/relation';
import { placeLabel } from '../../shared/ai-field-ask';

/**
 * A relation proposed from one end is one claim, read from whichever end's
 * form shows it: from the other end its word turns and its note's sides
 * swap; from its own end, or from no form at all, it reads as proposed.
 */
describe('a relation proposed from one end', () => {
  const walk = { ref: 'event:e-1', title: 'Ice walk' };
  const day = { ref: 'diary-entry:2026-01-02', title: '2026-01-02' };
  const proposed = {
    target: walk,
    other: day.ref,
    relation: 'depends-on' as const,
    note: {
      type: 'split' as const,
      currentText: 'Planned that day',
      relatedText: 'The walk was planned here',
    },
  };
  const refs = { [day.ref]: day };

  it('reads as proposed from its own end, or from no form', () => {
    for (const here of [walk.ref, undefined])
      expect(relationFromEnd(proposed, refs, here)).toEqual({
        reversed: false,
        from: walk,
        to: day,
        word: 'depends-on',
        note: proposed.note,
      });
  });

  it('turns its word and swaps its note from the other end', () => {
    expect(relationFromEnd(proposed, refs, day.ref)).toEqual({
      reversed: true,
      from: day,
      to: walk,
      word: 'affects',
      note: {
        type: 'split',
        currentText: 'The walk was planned here',
        relatedText: 'Planned that day',
      },
    });
    // A note for both sides reads the same from either.
    const shared = { type: 'shared' as const, text: 'Same day' };
    expect(
      relationFromEnd({ ...proposed, note: shared }, refs, day.ref).note,
    ).toBe(shared);
  });

  it('leads nowhere while its other end is not found', () => {
    expect(relationFromEnd(proposed, {}, walk.ref).to).toBeUndefined();
  });
});

describe('a ✦ named by its place', () => {
  const said = {
    asset_description: 'File description',
    ai_action_fields: { summary: 'Summary', body: 'Text', notes: 'Notes' },
  };

  it('says the field the place stands for, a file its description', () => {
    expect(placeLabel('field:summary', 'event:e-1', said)).toBe('Summary');
    expect(placeLabel('text:event-notes', 'event:e-1', said)).toBe('Notes');
    expect(placeLabel('text:event-body', undefined, said)).toBe('Text');
    expect(placeLabel('field:description', 'asset:a-1', said)).toBe(
      'File description',
    );
    // A field with no name of its own goes by its key.
    expect(placeLabel('field:colour', 'event:e-1', said)).toBe('colour');
  });
});
