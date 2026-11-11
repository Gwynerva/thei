import { describe, expect, it } from 'vitest';
import { giveBlockIds } from '../../shared/content-block-ids';
import type { ContentOutputData } from '../../shared/content';

/** A block as the database gives it back: with no `id` key when it has none. */
const paragraph = (
  text: string,
  id?: string,
): { id?: string; type: 'paragraph'; data: { text: string } } => ({
  ...(id ? { id } : {}),
  type: 'paragraph',
  data: { text },
});
const text = (...blocks: ReturnType<typeof paragraph>[]) =>
  ({ blocks }) as ContentOutputData;

describe('the ids of the blocks of a text', () => {
  it('leaves a text whose blocks all have ids as it is', () => {
    const data = text(paragraph('One', 'a'), paragraph('Two', 'b'));
    expect(giveBlockIds(data)).toBe(data);
  });

  it('gives an id of its own to every block that has none', () => {
    const given = giveBlockIds(
      text(paragraph('One'), paragraph('Two', 'kept'), paragraph('One')),
    );
    const ids = given.blocks.map((block) => block.id);
    expect(ids[1]).toBe('kept');
    expect(ids.every((id) => /^[A-Za-z0-9]{10}$|^kept$/u.test(id ?? ''))).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('writes the id first, as a save stores it, whatever the block came with', () => {
    const stored = giveBlockIds(
      text({ ...paragraph('One'), tunes: { spoiler: true } } as never),
    );
    expect(Object.keys(stored.blocks[0]!)).toEqual([
      'id',
      'type',
      'data',
      'tunes',
    ]);
    // A normalized block has the key already, with nothing in it.
    const saved = giveBlockIds(
      text({ id: undefined, type: 'paragraph', data: { text: 'One' } }),
    );
    expect(Object.keys(saved.blocks[0]!)).toEqual(['id', 'type', 'data']);
  });

  it('gives a block that repeats an id one of its own; the first keeps it', () => {
    const data = text(
      paragraph('One', 'a'),
      paragraph('Two', 'a'),
      paragraph('Three', 'b'),
      paragraph('Four', 'a'),
    );
    const given = giveBlockIds(data);
    const ids = given.blocks.map((block) => block.id);
    expect(ids[0]).toBe('a');
    expect(ids[2]).toBe('b');
    expect(new Set(ids).size).toBe(4);
    expect(Object.keys(given.blocks[1]!)[0]).toBe('id');
    expect(given.blocks.map((block) => block.data.text)).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
    ]);
    // Told apart, the text is left alone the next time.
    expect(giveBlockIds(given)).toBe(given);
  });

  it('gives a repeated id the stored one of the block that says the same', () => {
    const given = giveBlockIds(
      text(paragraph('One', 'a'), paragraph('Two', 'a')),
      text(paragraph('One', 'a'), paragraph('Two', 'second')),
    );
    expect(given.blocks.map((block) => block.id)).toEqual(['a', 'second']);
  });

  it('keeps the id of a stored block that says the same, each taken once', () => {
    const stored = text(
      paragraph('Same', 'first'),
      paragraph('Gone', 'gone'),
      paragraph('Same', 'second'),
    );
    const given = giveBlockIds(
      text(
        paragraph('Same'),
        paragraph('New'),
        paragraph('Same'),
        paragraph('Same'),
      ),
      stored,
    );
    const ids = given.blocks.map((block) => block.id);
    expect(ids[0]).toBe('first');
    expect(ids[2]).toBe('second');
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain('gone');
  });

  it('never gives a stored id a written block has already', () => {
    const given = giveBlockIds(
      text(paragraph('Same'), paragraph('Other', 'first')),
      text(paragraph('Same', 'first')),
    );
    expect(given.blocks[0]!.id).not.toBe('first');
    expect(given.blocks[1]!.id).toBe('first');
  });
});
