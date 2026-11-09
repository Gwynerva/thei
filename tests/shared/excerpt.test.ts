import { describe, expect, it } from 'vitest';
import { normalizeExcerpts } from '../../shared/excerpt';
import {
  diaryEntrySaysSomething,
  validateDiaryData,
} from '../../shared/admin/diary';
import { validateRelations } from '../../shared/relation';

const text = {
  data: {
    blocks: [{ type: 'paragraph', data: { text: 'Glued the stringers.' } }],
  },
};

const about = [{ entityType: 'project', entityId: 'p1', type: 'related' }];

function excerpt(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Stringers and the first glue-up',
    summary: '',
    humanReadableSlug: 'stringers',
    publicId: 'k3f9k3f9k3f9k3',
    isPrivate: false,
    content: text,
    relations: about,
    ...overrides,
  };
}

describe('an excerpt as its parent form saves it', () => {
  it('needs a title, a text and something it is about', () => {
    expect(normalizeExcerpts([excerpt()])).toMatchObject([
      { title: 'Stringers and the first glue-up', relations: about },
    ]);
    expect(() => normalizeExcerpts([excerpt({ title: ' ' })])).toThrow(
      'Excerpt title cannot be empty',
    );
    expect(() =>
      normalizeExcerpts([excerpt({ content: { data: { blocks: [] } } })]),
    ).toThrow('An excerpt needs a text');
    expect(() => normalizeExcerpts([excerpt({ relations: [] })])).toThrow(
      'says what it is about',
    );
    expect(() =>
      normalizeExcerpts([excerpt({ relations: undefined })]),
    ).toThrow('says what it is about');
  });

  it('is about projects, events and diary entries, never about an excerpt', () => {
    expect(() =>
      normalizeExcerpts([
        excerpt({
          relations: [
            { entityType: 'excerpt', entityId: 'x1', type: 'related' },
          ],
        }),
      ]),
    ).toThrow('Invalid related entity');
    expect(
      normalizeExcerpts([
        excerpt({
          relations: [
            { entityType: 'event', entityId: 'e1', type: 'influencing' },
            { entityType: 'diary-entry', entityId: 'd1', type: 'related' },
          ],
        }),
      ])![0]!.relations.map((item) => item.entityType),
    ).toEqual(['event', 'diary-entry']);
  });

  it('settles the title the way headings are settled', () => {
    expect(normalizeExcerpts([excerpt({ title: 'A title.' })])![0]!.title).toBe(
      'A title',
    );
  });

  it('leaves excerpts as they are when the form says nothing of them', () => {
    expect(normalizeExcerpts(undefined)).toBeUndefined();
    expect(() => normalizeExcerpts('x')).toThrow('Invalid excerpts');
  });
});

describe("a target's relations never carry an excerpt", () => {
  it('refuses an excerpt as the other end of a project, event or entry', () => {
    expect(() =>
      validateRelations(
        [{ entityType: 'excerpt', entityId: 'x1', type: 'related' }],
        { allowed: ['project', 'event', 'diary-entry'] },
      ),
    ).toThrow('Invalid related entity');
  });
});

describe('a diary entry told by its excerpts', () => {
  it('says something when it has a text or an excerpt', () => {
    expect(diaryEntrySaysSomething(text, [])).toBe(true);
    expect(diaryEntrySaysSomething({ data: { blocks: [] } }, [])).toBe(false);
    expect(diaryEntrySaysSomething(null, undefined)).toBe(false);
    expect(diaryEntrySaysSomething(null, [excerpt()])).toBe(true);
  });

  it('may be saved without a text of its own only with an excerpt', () => {
    const base = { date: '2024-03-02', access: 'public' as const };
    expect(validateDiaryData({ ...base, content: null })).toBe(
      'Diary entry content is required',
    );
    expect(
      validateDiaryData({
        ...base,
        content: { data: { blocks: [] } },
        excerpts: [],
      }),
    ).toBe('Diary entry content is required');
    expect(
      validateDiaryData({
        ...base,
        content: null,
        excerpts: [excerpt()],
      }),
    ).toMatchObject({
      date: '2024-03-02',
      content: { data: { blocks: [] } },
      excerpts: [{ title: 'Stringers and the first glue-up' }],
    });
  });
});
