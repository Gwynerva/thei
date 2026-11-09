import { describe, expect, it } from 'vitest';
import { buildDiaryUrl, dateFromDiaryUrlPart } from '../../shared/diary-url';
import {
  DIARY_LEAD_LENGTH,
  DIARY_SEO_LENGTH,
  diaryLead,
} from '../../shared/diary-text';
import { validateDiaryData } from '../../shared/admin/diary';
import { ProjectEventAccessLevel } from '../../shared/access-level';

describe('diary addresses', () => {
  it('addresses an entry by its day and nothing else', () => {
    expect(buildDiaryUrl('2026-04-28')).toBe('/diary/2026-04-28/');
    expect(dateFromDiaryUrlPart('2026-04-28')).toBe('2026-04-28');
  });

  it('refuses an address that names no real day', () => {
    expect(dateFromDiaryUrlPart('2026-02-30')).toBeUndefined();
    expect(dateFromDiaryUrlPart('2026-4-8')).toBeUndefined();
    expect(dateFromDiaryUrlPart('yesterday')).toBeUndefined();
  });
});

describe('diary lead', () => {
  const lead = (text: string, limit?: number) =>
    diaryLead(
      {
        data: { blocks: [{ type: 'paragraph', data: { text } }] } as any,
        excerptTitles: [],
        includePrivate: false,
        privateLabel: 'Private section',
      },
      limit,
    );

  it('leaves a short entry whole and collapses its whitespace', () => {
    expect(lead('  Утро.\n\nБыло тихо. ')).toBe('Утро. Было тихо.');
  });

  it('cuts at a word rather than through one, and says it cut', () => {
    const text = `${'a'.repeat(20)} ${'b'.repeat(20)} ${'c'.repeat(20)}`;
    expect(lead(text, 45)).toBe(`${'a'.repeat(20)} ${'b'.repeat(20)}…`);
  });

  it('cuts mid-word when retreating would leave almost nothing', () => {
    expect(lead(`a ${'b'.repeat(40)}`, 10)).toBe('a bbbbbbbb…');
  });

  it('puts the ellipsis in place of the punctuation the cut leaves', () => {
    expect(lead('Свет выставили, звук настроили', 18)).toBe('Свет выставили…');
    expect(lead('Кофе остыл. Опять остыл', 14)).toBe('Кофе остыл…');
    expect(lead('Вышла — и дождь', 8)).toBe('Вышла…');
  });

  it('leaves an entry that fits alone, ellipsis and all', () => {
    expect(lead('Кофе остыл. Опять.', 18)).toBe('Кофе остыл. Опять.');
  });

  it('cuts to the card by default and to the meta description on request', () => {
    const long = 'word '.repeat(80);
    expect(lead(long).length).toBeLessThanOrEqual(DIARY_LEAD_LENGTH);
    expect(lead(long, DIARY_SEO_LENGTH).length).toBeLessThanOrEqual(
      DIARY_SEO_LENGTH,
    );
    expect(DIARY_SEO_LENGTH).toBeLessThan(DIARY_LEAD_LENGTH);
  });
});

describe('diary validation', () => {
  const content = {
    data: { blocks: [{ type: 'paragraph', data: { text: 'Что-то было.' } }] },
  };

  it('accepts a day with something written on it', () => {
    const result = validateDiaryData({
      date: ' 2026-04-28 ',
      access: ProjectEventAccessLevel.Public,
      content: content as never,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.date).toBe('2026-04-28');
  });

  it('refuses a day that does not exist', () => {
    expect(
      validateDiaryData({
        date: '2026-02-30',
        access: ProjectEventAccessLevel.Public,
        content: content as never,
      }),
    ).toBe('Invalid date');
  });

  it('refuses an entry with nothing in it', () => {
    expect(
      validateDiaryData({
        date: '2026-04-28',
        access: ProjectEventAccessLevel.Public,
        content: null,
      }),
    ).toBe('Diary entry content is required');
  });

  it('normalizes relations and rejects a repeated entity', () => {
    const entry = (relations: unknown) => ({
      date: '2026-04-28',
      access: ProjectEventAccessLevel.Public,
      content: content as never,
      relations: relations as never,
    });
    expect(
      validateDiaryData(
        entry([
          {
            entityType: 'project',
            entityId: ' p1 ',
            type: 'influencing',
            note: { type: 'shared', text: ' Why ' },
          },
        ]),
      ),
    ).toMatchObject({
      relations: [
        {
          entityType: 'project',
          entityId: 'p1',
          type: 'influencing',
          note: { type: 'shared', text: 'Why' },
        },
      ],
    });
    expect(
      validateDiaryData(
        entry([
          { entityType: 'event', entityId: 'e1', type: 'related' },
          { entityType: 'event', entityId: 'e1', type: 'dependent' },
        ]),
      ),
    ).toBe('Duplicate related entity');
  });
});

describe('diary lead of a body', () => {
  const body = {
    blocks: [
      { type: 'header', data: { text: 'Morning', level: 2 } },
      { type: 'paragraph', data: { text: 'Out in the open.' } },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'secret', edge: 'start' },
      },
      { type: 'header', data: { text: 'Noon', level: 2 } },
      { type: 'paragraph', data: { text: 'Only for me.' } },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'secret', edge: 'end' },
      },
      { type: 'header', data: { text: 'A <b>small</b> point', level: 3 } },
      { type: 'header', data: { text: 'Evening', level: 2 } },
      { type: 'paragraph', data: { text: 'Home.' } },
    ],
  } as any;
  const parts = { excerptTitles: [], privateLabel: 'Private section' };

  it('names the public headings, then quotes the opening with its private part marked', () => {
    expect(diaryLead({ ...parts, data: body, includePrivate: false })).toBe(
      'Morning · Evening — Morning Out in the open. [Private section] A small point Evening Home.',
    );
  });

  it('names a private heading only to its owner, and quotes the whole', () => {
    expect(diaryLead({ ...parts, data: body, includePrivate: true })).toBe(
      'Morning · Noon · Evening — Morning Out in the open. Noon Only for me. A small point Evening Home.',
    );
  });

  it("names the entry's excerpts after its headings", () => {
    expect(
      diaryLead({
        ...parts,
        data: body,
        excerptTitles: ['The lamp', ' A  quiet\nmove '],
        includePrivate: false,
      }),
    ).toBe(
      'Morning · Evening · The lamp · A quiet move — Morning Out in the open. [Private section] A small point Evening Home.',
    );
  });

  it('is the names alone when the day has no words to quote', () => {
    expect(
      diaryLead({
        ...parts,
        data: null,
        excerptTitles: ['The lamp', 'The moon'],
        includePrivate: false,
      }),
    ).toBe('The lamp · The moon');
    expect(diaryLead({ ...parts, data: null, includePrivate: false })).toBe('');
  });

  it('gives the opening alone without headings', () => {
    expect(
      diaryLead({
        ...parts,
        data: body,
        excerptTitles: ['The lamp'],
        includePrivate: false,
        headings: false,
      }),
    ).toBe(
      'Morning Out in the open. [Private section] A small point Evening Home.',
    );
  });

  it('cuts through the names like any other words, never through one', () => {
    expect(
      diaryLead(
        {
          ...parts,
          data: body,
          excerptTitles: ['The lamp'],
          includePrivate: false,
        },
        30,
      ),
    ).toBe('Morning · Evening · The lamp…');
    expect(
      diaryLead(
        {
          ...parts,
          data: body,
          excerptTitles: ['The lamp'],
          includePrivate: false,
        },
        20,
      ),
    ).toBe('Morning · Evening…');
  });

  it('reads the text as a public page received it, placeholders and all', () => {
    const page = {
      blocks: [
        { type: 'header', data: { text: 'Morning', level: 2 } },
        { type: 'paragraph', data: { text: 'Out in the open.' } },
        {
          type: 'privateSectionPlaceholder',
          data: {
            blockCount: 1,
            wordCount: 3,
            assetCount: 0,
            assetTotalSize: 0,
          },
        },
        { type: 'paragraph', data: { text: 'Home.' } },
      ],
    } as any;
    expect(diaryLead({ ...parts, data: page, includePrivate: true })).toBe(
      'Morning — Morning Out in the open. [Private section] Home.',
    );
    const own = {
      blocks: [
        { type: 'paragraph', data: { text: 'Out in the open.' } },
        {
          type: 'privateSectionExpanded',
          data: {
            summary: {
              blockCount: 1,
              wordCount: 3,
              assetCount: 0,
              assetTotalSize: 0,
            },
            blocks: [
              { type: 'header', data: { text: 'Noon', level: 2 } },
              { type: 'paragraph', data: { text: 'Only for me.' } },
            ],
          },
        },
      ],
    } as any;
    expect(diaryLead({ ...parts, data: own, includePrivate: true })).toBe(
      'Noon — Out in the open. Noon Only for me.',
    );
  });

  it('leaves no marker for an empty private section', () => {
    const empty = {
      blocks: [
        { type: 'paragraph', data: { text: 'Out in the open.' } },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'secret', edge: 'start' },
        },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'secret', edge: 'end' },
        },
      ],
    } as any;
    expect(diaryLead({ ...parts, data: empty, includePrivate: false })).toBe(
      'Out in the open.',
    );
  });
});
