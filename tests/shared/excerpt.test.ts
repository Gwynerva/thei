import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { excerptSubjectLimit, normalizeExcerpts } from '../../shared/excerpt';
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

const about = { entityType: 'project', entityId: 'p1', type: 'related' };

function excerpt(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Stringers and the first glue-up',
    summary: '',
    humanReadableSlug: 'stringers',
    publicId: 'k3f9k3f9k3f9k3',
    isPrivate: false,
    content: text,
    about,
    ...overrides,
  };
}

describe('an excerpt as its parent form saves it', () => {
  it('needs a title and a text, and is about one thing', () => {
    expect(normalizeExcerpts([excerpt()])).toMatchObject([
      { title: 'Stringers and the first glue-up', about },
    ]);
    expect(() => normalizeExcerpts([excerpt({ title: ' ' })])).toThrow(
      'Excerpt title cannot be empty',
    );
    expect(() =>
      normalizeExcerpts([excerpt({ content: { data: { blocks: [] } } })]),
    ).toThrow('An excerpt needs a text');
    expect(() => normalizeExcerpts([excerpt({ about: [about] })])).toThrow(
      'An excerpt is about one thing, not a list',
    );
  });

  it('is saved about nothing once what it was about is deleted', () => {
    // Its parent's form still saves; the excerpt's own form asks again.
    expect(normalizeExcerpts([excerpt({ about: null })])![0]!.about).toBe(null);
    expect(normalizeExcerpts([excerpt({ about: undefined })])![0]!.about).toBe(
      null,
    );
  });

  it('is about a project, an event or a diary entry, never an excerpt', () => {
    expect(() =>
      normalizeExcerpts([
        excerpt({
          about: { entityType: 'excerpt', entityId: 'x1', type: 'related' },
        }),
      ]),
    ).toThrow('Invalid related entity');
    for (const entityType of ['project', 'event', 'diary-entry'])
      expect(
        normalizeExcerpts([
          excerpt({
            about: { entityType, entityId: 'e1', type: 'influencing' },
          }),
        ])![0]!.about,
      ).toMatchObject({ entityType, type: 'influencing' });
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

describe('what an excerpt is about, as it closes the excerpt', () => {
  it('closes it while private or open by its link only, and never else', () => {
    expect(excerptSubjectLimit(ProjectEventAccessLevel.Private)).toBe(
      ProjectEventAccessLevel.Private,
    );
    expect(excerptSubjectLimit(ProjectEventAccessLevel.LinkOnly)).toBe(
      ProjectEventAccessLevel.LinkOnly,
    );
    expect(excerptSubjectLimit(ProjectEventAccessLevel.Public)).toBeUndefined();
    // About nothing: its subject was deleted.
    expect(excerptSubjectLimit(undefined)).toBeUndefined();
  });

  it('keeps a section’s fields, read the same way', () => {
    expect(() => normalizeExcerpts([excerpt({ isPrivate: 'no' })])).toThrow(
      'Invalid excerpt privacy',
    );
    expect(() => normalizeExcerpts([excerpt({ publicId: '!' })])).toThrow(
      'Invalid public ID',
    );
    expect(
      normalizeExcerpts([
        excerpt({
          excerptUuid: ' x-1 ',
          title: ' A title. ',
          bannerAssetUuid: 'a-1',
        }),
      ])![0],
    ).toMatchObject({
      excerptUuid: 'x-1',
      title: 'A title',
      bannerAssetUuid: 'a-1',
    });
  });
});
