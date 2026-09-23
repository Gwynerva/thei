import { describe, expect, it } from 'vitest';
import { buildDiaryUrl, dateFromDiaryUrlPart } from '../../shared/diary-url';
import { diaryContentExcerpt, diaryExcerpt } from '../../shared/diary-text';
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

describe('diary excerpt', () => {
  it('leaves a short entry whole and collapses its whitespace', () => {
    expect(diaryExcerpt('  Утро.\n\nБыло тихо. ')).toBe('Утро. Было тихо.');
  });

  it('cuts at a word rather than through one', () => {
    const text = `${'a'.repeat(20)} ${'b'.repeat(20)} ${'c'.repeat(20)}`;
    expect(diaryExcerpt(text, 45)).toBe(`${'a'.repeat(20)} ${'b'.repeat(20)}`);
  });

  it('cuts mid-word when retreating would leave almost nothing', () => {
    expect(diaryExcerpt(`a ${'b'.repeat(40)}`, 10)).toBe('a bbbbbbbb');
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
});

describe('diary excerpt of a body', () => {
  const body = {
    blocks: [
      { type: 'header', data: { text: 'Morning', level: 2 } },
      { type: 'paragraph', data: { text: 'Out in the open.' } },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'secret', edge: 'start' },
      },
      { type: 'paragraph', data: { text: 'Only for me.' } },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'secret', edge: 'end' },
      },
      { type: 'paragraph', data: { text: 'Evening.' } },
    ],
  } as any;

  it('marks a private section instead of quoting it to a visitor', () => {
    expect(diaryContentExcerpt(body, false, 'Private section')).toBe(
      'Morning Out in the open. [Private section] Evening.',
    );
  });

  it('quotes the whole entry, headings as plain text, to its owner', () => {
    expect(diaryContentExcerpt(body, true, 'Private section')).toBe(
      'Morning Out in the open. Only for me. Evening.',
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
    expect(diaryContentExcerpt(empty, false, 'Private section')).toBe(
      'Out in the open.',
    );
  });
});
