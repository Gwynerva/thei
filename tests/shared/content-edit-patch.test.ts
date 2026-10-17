import { describe, expect, it } from 'vitest';
import { normalizeContentData } from '#layers/thei/shared/content';
import {
  applyPreparedTextEdits,
  correctionPending,
  editChangesOnlyTypography,
  editedWordCount,
  editIsLocalFix,
  type TextEdit,
} from '#layers/thei/shared/content-edit-markdown/patch-core';
import { prepareTextEdit } from '#layers/thei/shared/content-edit-markdown/patch';
import type { ContentOutputData } from '#layers/thei/shared/content';

/** Edits written as a client writes them, in editing Markdown. */
const applyTextEdits = (data: ContentOutputData, edits: readonly TextEdit[]) =>
  applyPreparedTextEdits(data, edits.map(prepareTextEdit));

const text = normalizeContentData({
  blocks: [
    { type: 'header', data: { text: 'Босс &amp; арена', level: 2 } },
    {
      type: 'paragraph',
      data: {
        text: 'Тепер он телепортируеться по арене. Играл в D&amp;D и в <a data-content-link="entity" data-entity-type="project" data-entity-id="p-1">Парапет</a>, парапет.',
      },
    },
  ],
});

const paragraph = (data: typeof text) => data.blocks[1]!.data.text as string;

describe('text edits', () => {
  it('fix a word in place and leave every other byte alone', () => {
    const { data, outcomes } = applyTextEdits(text, [
      { find: 'Тепер', replace: 'Теперь' },
      { find: 'телепортируеться', replace: 'телепортируется' },
    ]);
    expect(outcomes.map((outcome) => outcome.count)).toEqual([1, 1]);
    expect(paragraph(data)).toBe(
      paragraph(text)
        .replace('Тепер ', 'Теперь ')
        .replace('телепортируеться', 'телепортируется'),
    );
    // The copy is changed, not the text it was made from.
    expect(paragraph(text)).toContain('Тепер ');
  });

  it('find words as a reader sees them, entities and all', () => {
    const { data, outcomes } = applyTextEdits(text, [
      { find: 'D&D', replace: 'D&D 5e' },
      { find: 'Босс & арена', replace: 'Босс и арена' },
    ]);
    expect(outcomes.map((outcome) => outcome.count)).toEqual([1, 1]);
    expect(paragraph(data)).toContain('D&amp;D 5e');
    expect(data.blocks[0]!.data.text).toBe('Босс и арена');
  });

  it('turn a mention into a link', () => {
    const { data, outcomes } = applyTextEdits(text, [
      { find: ', парапет.', replace: ', [парапет](thei:event/e-1).' },
    ]);
    expect(outcomes[0]!.count).toBe(1);
    expect(paragraph(data)).toContain(
      ', <a data-content-link="entity" data-entity-type="event" data-entity-id="e-1">парапет</a>.',
    );
  });

  it('refuse a link inside a link', () => {
    const { outcomes } = applyTextEdits(text, [
      { find: 'Парапет', replace: '[Парапет](thei:event/e-1)' },
    ]);
    expect(outcomes[0]!.problem).toMatch(/already a link/);
  });

  it('refuse what is not there, or is there more than once', () => {
    const { outcomes } = applyTextEdits(text, [
      { find: 'нет такого', replace: 'x' },
      { find: 'ар', replace: 'АР' },
      { find: 'он телепортируеться', replace: 'он' },
    ]);
    expect(outcomes[0]!.problem).toMatch(/not in the text/);
    expect(outcomes[1]!.problem).toMatch(/stands \d+ times/);
    expect(outcomes[2]!.count).toBe(1);
  });

  it('refuse what only changes typography', () => {
    expect(
      editChangesOnlyTypography({
        find: '"слово" - да',
        replace: '«слово» — да',
      }),
    ).toBe(true);
    expect(
      editChangesOnlyTypography({ find: 'Тепер', replace: 'Теперь' }),
    ).toBe(false);
    const { outcomes } = applyTextEdits(text, [
      { find: 'по арене.', replace: 'по арене…' },
    ]);
    expect(outcomes[0]!.count).toBe(1);
  });

  it('count the words an edit touches', () => {
    expect(editedWordCount({ find: 'Тепер он', replace: 'Теперь он' })).toBe(1);
    expect(
      editedWordCount({
        find: 'Реально кайфанул, ваще огонь',
        replace: 'Мне очень понравилось, это было замечательно',
      }),
    ).toBe(6);
  });
});

describe('a local fix', () => {
  it('fixes letters, endings, punctuation and a missing short word', () => {
    for (const [find, replace] of [
      ['Тепер он', 'Теперь он'],
      ['телепортируеться', 'телепортируется'],
      ['Дописал фразу', 'Дописал фразу,'],
      ['пошёл магазин', 'пошёл в магазин'],
      ['в течении дня', 'в течение дня'],
      // Two neighbours swapped are one slip of the fingers.
      ['teh captain', 'the captain'],
      ['третий абзца', 'третий абзац'],
    ])
      expect(editIsLocalFix({ find: find!, replace: replace! }), find).toBe(
        true,
      );
  });

  it('is never a word swapped for another, or a phrase rewritten', () => {
    for (const [find, replace] of [
      ['дальше красоту', 'дальше прелесть'],
      ['красоту всякую писать', 'красивые вещи сочинять'],
      ['ваще огонь', 'вообще замечательно'],
      ['кайфанул', 'получил удовольствие'],
    ])
      expect(editIsLocalFix({ find: find!, replace: replace! }), find).toBe(
        false,
      );
  });
});

describe('a correction already made', () => {
  const said = (words: string) =>
    normalizeContentData({
      blocks: [{ type: 'paragraph', data: { text: words } }],
    });

  it('is pending while its words stand as they were', () => {
    expect(
      correctionPending(said('Дописал фразу после.'), {
        find: 'Дописал фразу',
        replace: 'Дописал фразу,',
      }),
    ).toBe(true);
    expect(
      correctionPending(said('Тепер он тут.'), {
        find: 'Тепер',
        replace: 'Теперь',
      }),
    ).toBe(true);
  });

  it('is not once fixed, even where the fix keeps the words', () => {
    expect(
      correctionPending(said('Дописал фразу, после.'), {
        find: 'Дописал фразу',
        replace: 'Дописал фразу,',
      }),
    ).toBe(false);
    expect(
      correctionPending(said('Теперь он тут.'), {
        find: 'Тепер',
        replace: 'Теперь',
      }),
    ).toBe(false);
    expect(
      correctionPending(said('Совсем другое.'), {
        find: 'Тепер',
        replace: 'Теперь',
      }),
    ).toBe(false);
  });

  it('is pending where one place is fixed and another is not', () => {
    expect(
      correctionPending(said('Теперь и тут, и Тепер там.'), {
        find: 'Тепер',
        replace: 'Теперь',
      }),
    ).toBe(true);
  });
});
