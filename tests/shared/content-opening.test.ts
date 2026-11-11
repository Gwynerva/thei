import { describe, expect, it } from 'vitest';
import {
  CONTENT_OPENING_LENGTH,
  contentOpening,
  summaryOrOpening,
} from '../../shared/content-opening';

const paragraph = (text: string) => ({ type: 'paragraph', data: { text } });
const edge = (side: 'start' | 'end') => ({
  type: 'privateSectionBoundary',
  data: { sectionId: 'hidden', edge: side },
});
const stranger = { includePrivate: false, privateLabel: 'Private section' };
const owner = { includePrivate: true, privateLabel: 'Private section' };

describe('how a text begins', () => {
  const stored = {
    blocks: [
      { type: 'header', data: { text: 'Morning', level: 2 } },
      paragraph('Out in the <b>open</b>.'),
      edge('start'),
      paragraph('Only for me.'),
      edge('end'),
      paragraph('Home.'),
    ],
  } as any;

  it('is its first words, headings among them, without the markup', () => {
    expect(contentOpening(stored, owner)).toBe(
      'Morning Out in the open. Only for me. Home.',
    );
  });

  it('marks a private part for whoever may not read it', () => {
    expect(contentOpening(stored, stranger)).toBe(
      'Morning Out in the open. [Private section] Home.',
    );
  });

  it('reads the text as a public page received it', () => {
    const page = {
      blocks: [
        paragraph('Out in the open.'),
        {
          type: 'privateSectionPlaceholder',
          data: {
            blockCount: 1,
            wordCount: 3,
            assetCount: 0,
            assetTotalSize: 0,
          },
        },
        {
          type: 'privateSectionExpanded',
          data: { blocks: [paragraph('Opened for me.')] },
        },
        paragraph('Home.'),
      ],
    } as any;
    // Cut for its reader already, so taken whole.
    expect(contentOpening(page, owner)).toBe(
      'Out in the open. [Private section] Opened for me. Home.',
    );
  });

  it('is nothing for a text with no word for its reader', () => {
    const placeholder = {
      type: 'privateSectionPlaceholder',
      data: { blockCount: 1, wordCount: 3, assetCount: 0, assetTotalSize: 0 },
    };
    // As a public page received it: only what stands in for private parts.
    const page = { blocks: [placeholder, placeholder] } as any;
    expect(contentOpening(page, owner)).toBe('');
    expect(summaryOrOpening('', page, owner)).toBe('');
    // As stored, for whoever may not read its private parts.
    const hidden = {
      blocks: [edge('start'), paragraph('Only for me.'), edge('end')],
    } as any;
    expect(contentOpening(hidden, stranger)).toBe('');
    expect(contentOpening(hidden, owner)).toBe('Only for me.');
  });

  it('is cut at a word and marked as cut', () => {
    const long = { blocks: [paragraph('It took days. '.repeat(60))] } as any;
    const opening = contentOpening(long, stranger);
    expect(opening.length).toBeLessThanOrEqual(CONTENT_OPENING_LENGTH + 1);
    expect(opening.endsWith('…')).toBe(true);
    expect(contentOpening(long, stranger, 20)).toBe('It took days. It…');
  });

  it('is nothing for no text', () => {
    expect(contentOpening(null, stranger)).toBe('');
    expect(contentOpening({ blocks: [] } as any, stranger)).toBe('');
  });
});

describe('a summary, or else the opening', () => {
  const data = { blocks: [paragraph('How it begins.')] } as any;

  it('keeps the summary the owner wrote, as typed', () => {
    expect(summaryOrOpening('By hand', data, stranger)).toBe('By hand');
  });

  it('falls back to the text for an empty or blank one', () => {
    expect(summaryOrOpening('', data, stranger)).toBe('How it begins.');
    expect(summaryOrOpening('  ', data, stranger)).toBe('How it begins.');
    expect(summaryOrOpening('', null, stranger)).toBe('');
  });
});
