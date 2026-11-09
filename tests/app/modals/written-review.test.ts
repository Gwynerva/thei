import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiActionItem, AiReviewText } from '../../../shared/ai';
import type { ContentOutputData } from '../../../shared/content';
import { parseEditMarkdownToBlocks } from '../../../shared/content-edit-markdown/parse';
import enModule from '../../../shared/language/list/en';
import { fieldName } from '../../../app/composables/ai-format';
import { writtenReview } from '../../../app/modals/content-editor/review/review';

/**
 * A text an AI wrote whole is read as it would stand, each block it brings,
 * changes or takes away a part to take or leave out. What is left out is
 * taken out of the proposal's own words, which are then applied as they
 * stand: the words handed back read as exactly the blocks taken.
 */
beforeEach(() => {
  vi.stubGlobal('phrase', { value: enModule.phrases });
  vi.stubGlobal('publicText', (text: string | null | undefined) => text ?? '');
  vi.stubGlobal('fieldName', fieldName);
});

const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph',
  data: { text },
});
const text = (...blocks: ReturnType<typeof paragraph>[]) =>
  ({ blocks }) as unknown as ContentOutputData;

function reviewed(
  payload: Record<string, unknown>,
  data: ContentOutputData,
  written: NonNullable<AiReviewText['written']>,
): AiReviewText {
  return {
    action: { kind: payload.kind, payload } as unknown as AiActionItem,
    data,
    written,
  };
}

/** The words of the blocks markdown reads as. */
const wordsOf = (markdown: string) =>
  parseEditMarkdownToBlocks(markdown).blocks.map(
    (block) => (block.data as { text?: string }).text,
  );

describe('a text written from scratch', () => {
  const proposal = reviewed(
    { kind: 'write', text: 'body', mode: 'new', markdown: '' },
    text(),
    [
      {
        key: 'markdown',
        proposed: text(
          paragraph('n1', 'One.'),
          paragraph('n2', 'Two.'),
          paragraph('n3', 'Three.'),
        ),
      },
    ],
  );

  it('is a part per block, every one taken by «take all»', () => {
    const { review } = writtenReview(proposal)!;
    expect(review.parts.map((part) => part.kind)).toEqual([
      'added',
      'added',
      'added',
    ]);
  });

  it('hands back the blocks taken, and nothing when all are', () => {
    const written = writtenReview(proposal)!;
    const [one, two, three] = written.review.parts.map((part) => part.id);
    const words = written.texts({
      [one!]: 'accepted',
      [two!]: 'kept',
      [three!]: 'accepted',
    });
    expect(wordsOf(words.markdown!)).toEqual(['One.', 'Three.']);
    expect(
      written.texts({
        [one!]: 'accepted',
        [two!]: 'accepted',
        [three!]: 'accepted',
      }),
    ).toEqual({});
  });
});

describe('a text added after the text', () => {
  it('hands back only the blocks it brings', () => {
    const before = paragraph('a', 'Before.');
    const written = writtenReview(
      reviewed(
        { kind: 'write', text: 'body', mode: 'append', markdown: '' },
        text(before),
        [
          {
            key: 'markdown',
            proposed: text(
              before,
              paragraph('n1', 'New one.'),
              paragraph('n2', 'New two.'),
            ),
          },
        ],
      ),
    )!;
    const [one, two] = written.review.parts.map((part) => part.id);
    expect(written.review.parts).toHaveLength(2);
    const words = written.texts({ [one!]: 'kept', [two!]: 'accepted' });
    expect(wordsOf(words.markdown!)).toEqual(['New two.']);
  });
});

describe('a text written in place of the text', () => {
  it('keeps a block as it was where its rewrite is left out', () => {
    const written = writtenReview(
      reviewed(
        { kind: 'write', text: 'body', mode: 'replace', markdown: '' },
        text(paragraph('a', 'Stays.'), paragraph('b', 'Old words.')),
        [
          {
            key: 'markdown',
            proposed: text(
              paragraph('a', 'Stays.'),
              paragraph('b', 'New words.'),
              paragraph('c', 'Brought.'),
            ),
          },
        ],
      ),
    )!;
    const decisions = Object.fromEntries(
      written.review.parts.map((part) => [
        part.id,
        part.kind === 'added' ? 'accepted' : 'kept',
      ]),
    ) as Record<string, 'accepted' | 'kept'>;
    expect(wordsOf(written.texts(decisions).markdown!)).toEqual([
      'Stays.',
      'Old words.',
      'Brought.',
    ]);
  });
});

describe('a new entity’s texts', () => {
  const build = () =>
    writtenReview(
      reviewed(
        {
          kind: 'create',
          entity: 'project',
          fields: { title: 'P', sections: [{ title: 'Start', body: '' }] },
        },
        text(),
        [
          {
            key: 'fields.description',
            field: 'description',
            proposed: text(paragraph('d', 'About it.')),
          },
          {
            key: 'fields.sections.0.body',
            section: 'Start',
            proposed: text(paragraph('s1', 'First.'), paragraph('s2', 'Then.')),
          },
        ],
      ),
    )!;

  it('are gone through as one, each under its name', () => {
    const written = build();
    const rows = written.review.rows({}, 'read');
    const headings = rows.flatMap((row) =>
      row.type === 'block' && row.block.type === 'header'
        ? [(row.block.data as { text: string }).text]
        : [],
    );
    expect(headings).toEqual(['Description', 'Section “Start”']);
    const ids = written.review.parts.map((part) => part.id);
    expect(new Set(ids).size).toBe(3);
    expect(
      rows.flatMap((row) =>
        row.type === 'block' && row.part ? [row.part] : [],
      ),
    ).toEqual(ids);
  });

  it('hand back each text the owner left something out of, by its key', () => {
    const written = build();
    const [description, first, then] = written.review.parts.map(
      (part) => part.id,
    );
    const words = written.texts({
      [description!]: 'accepted',
      [first!]: 'accepted',
      [then!]: 'kept',
    });
    expect(Object.keys(words)).toEqual(['fields.sections.0.body']);
    expect(wordsOf(words['fields.sections.0.body']!)).toEqual(['First.']);
  });
});
