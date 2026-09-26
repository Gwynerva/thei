import { describe, expect, it } from 'vitest';
import {
  buildTagProfile,
  combineTagEvidence,
  recommendTags,
  similarTagSignal,
  tagTextSignal,
  togetherTagSignal,
  type TagEvidenceDocument,
} from '../../shared/tag-recommendation';
import {
  containsPhrase,
  inverseDocumentFrequency,
  normalizeTermText,
  readTerms,
  termVector,
  wordTokens,
} from '../../shared/text-terms';

const flat = () => 1;

function draftText(text: string, title = '') {
  const { counts, surfaces } = readTerms({ title, text });
  return {
    terms: counts,
    surfaces,
    normalizedText: normalizeTermText(`${title}\n${text}`),
  };
}

function textScore(title: string, text: string, description?: string) {
  return (
    tagTextSignal(
      buildTagProfile({ tagUuid: 't', title, description }, flat),
      draftText(text),
      flat,
    )?.score ?? 0
  );
}

type Entry = {
  type?: 'project' | 'event';
  id: string;
  title: string;
  text: string;
  tags?: string[];
};

function corpus(entries: Entry[]) {
  const counted = entries.map((entry) => ({
    type: entry.type ?? ('event' as const),
    id: entry.id,
    title: entry.title,
    key: `${entry.type ?? 'event'}:${entry.id}`,
    tagUuids: entry.tags ?? [],
    terms: readTerms(entry).counts,
  }));
  const frequencies = new Map<string, number>();
  for (const { terms } of counted)
    for (const term of terms.keys())
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const idf = (term: string) =>
    inverseDocumentFrequency(counted.length, frequencies.get(term) ?? 0);
  const documents: TagEvidenceDocument[] = counted.map((document) => ({
    ...document,
    vector: termVector(document.terms, idf),
  }));
  return { documents, idf };
}

describe('text terms', () => {
  it('reads words, not characters, and folds ё', () => {
    expect(wordTokens('Ёжик said: «AI»!')).toEqual(['ежик', 'said', 'ai']);
  });

  it('finds a phrase only where it stands on its own', () => {
    expect(containsPhrase('we write c++ daily', 'c++')).toBe(true);
    expect(containsPhrase('objective-c is old', 'c++')).toBe(false);
    expect(containsPhrase('abc++', 'c++')).toBe(false);
  });
});

describe('tag name in the text', () => {
  it('does not find a short name inside a longer word', () => {
    expect(textScore('AI', 'She said it was a good start')).toBe(0);
    expect(textScore('Art', 'We start again')).toBe(0);
    expect(textScore('AI', 'Tools built on AI')).toBe(1);
  });

  it('finds a name in any of its forms', () => {
    expect(textScore('Путешествие', 'Рассказ о путешествиях по северу')).toBe(
      1,
    );
    expect(textScore('Дизайн', 'Работа над дизайном карты')).toBe(1);
    expect(textScore('Travel', 'We travelled for a week')).toBe(1);
  });

  it('looks for names written with more than letters as they are written', () => {
    expect(textScore('C++', 'A renderer in C++')).toBe(1);
    expect(textScore('C++', 'Plan C was better')).toBe(0);
  });

  it('finds a name by its alias in brackets', () => {
    expect(textScore('Доступность (a11y)', 'Проверка a11y экрана')).toBe(1);
    expect(textScore('Доступность (a11y)', 'Доступности уделили время')).toBe(
      1,
    );
  });

  it('counts most of a long name by half and a little of it not at all', () => {
    const idf = (term: string) => (term === 'open' ? 0.2 : 3);
    const profile = buildTagProfile(
      { tagUuid: 't', title: 'Open source' },
      idf,
    );
    expect(tagTextSignal(profile, draftText('An open door'), idf)).toBe(
      undefined,
    );
    const listed = buildTagProfile(
      { tagUuid: 't', title: 'C++, .NET & API' },
      flat,
    );
    expect(
      tagTextSignal(listed, draftText('A C++ library with an API'), flat)
        ?.score,
    ).toBeCloseTo(1 / 3);
  });

  it('reads the description as a weaker set of words for the tag', () => {
    expect(
      textScore(
        'Путешествия',
        'Поезд до вокзала и гостиница у моря',
        'Поезда, вокзалы, гостиницы и дороги',
      ),
    ).toBe(0.5);
  });
});

describe('similar entities', () => {
  const { documents, idf } = corpus([
    {
      id: 'a',
      title: 'Sea trip',
      text: 'boat sea waves island',
      tags: ['t-sea'],
    },
    {
      id: 'b',
      title: 'Island days',
      text: 'sea island boat sunset',
      tags: ['t-sea', 't-photo'],
    },
    {
      id: 'c',
      title: 'Coding night',
      text: 'compiler code bugs',
      tags: ['t-code'],
    },
    { id: 'd', title: 'Untagged sea story', text: 'sea boat island waves' },
  ]);
  const vector = termVector(
    readTerms({ title: 'Boat', text: 'boat to the island by sea' }).counts,
    idf,
  );

  it('lets similar tagged entities vote for their tags', () => {
    const signals = similarTagSignal(vector, documents);
    expect(signals.get('t-sea')?.entities.map((entity) => entity.id)).toEqual(
      expect.arrayContaining(['a', 'b']),
    );
    expect(signals.get('t-sea')!.score).toBeGreaterThan(
      signals.get('t-photo')?.score ?? 0,
    );
    expect(signals.has('t-code')).toBe(false);
  });

  it('keeps the entity being edited out of its own evidence', () => {
    const signals = similarTagSignal(vector, documents, 'event:a');
    expect(
      signals.get('t-sea')?.entities.map((entity) => entity.id) ?? [],
    ).not.toContain('a');
  });
});

describe('tags that go together', () => {
  const documents = corpus([
    { id: '1', title: 'x', text: '', tags: ['t-vue', 't-ts', 't-common'] },
    { id: '2', title: 'x', text: '', tags: ['t-vue', 't-ts', 't-common'] },
    { id: '3', title: 'x', text: '', tags: ['t-vue', 't-common'] },
    { id: '4', title: 'x', text: '', tags: ['t-go', 't-common'] },
    { id: '5', title: 'x', text: '', tags: ['t-go', 't-common'] },
    { id: '6', title: 'x', text: '', tags: ['t-rare', 't-vue'] },
  ]).documents;

  it('suggests tags that go with the chosen ones more than with anything', () => {
    const signals = togetherTagSignal(documents, new Set(['t-vue']));
    expect(signals.get('t-ts')?.score).toBeCloseTo(2 / 4);
    // On nearly everything, so going with Vue says nothing.
    expect(signals.has('t-common')).toBe(false);
    // Together only once.
    expect(signals.has('t-rare')).toBe(false);
  });

  it('keeps the entity being edited out of the counts', () => {
    const signals = togetherTagSignal(documents, new Set(['t-vue']), 'event:1');
    expect(signals.has('t-ts')).toBe(false);
  });
});

describe('combining evidence', () => {
  it('adds up independent hints without passing certainty', () => {
    const { score, reasons } = combineTagEvidence(
      {
        text: { score: 1, terms: ['sea'] },
        related: {
          score: 1,
          entities: [{ type: 'project', id: 'p', title: 'Voyage' }],
        },
        together: { score: 0.5, tagUuids: ['t-a', 't-missing'] },
      },
      (tagUuid) => (tagUuid === 't-a' ? 'A' : undefined),
    );
    expect(score).toBeCloseTo(1 - 0.1 * 0.5 * (1 - 0.45 * 0.5));
    expect(reasons).toEqual([
      { kind: 'text', terms: ['sea'] },
      {
        kind: 'related',
        entities: [{ type: 'project', id: 'p', title: 'Voyage' }],
      },
      { kind: 'together', tags: ['A'] },
    ]);
  });

  it('recommends from every kind of evidence and leaves chosen tags out', () => {
    const { documents, idf } = corpus([
      {
        type: 'project',
        id: 'voyage',
        title: 'Voyage',
        text: 'ship',
        tags: ['t-sea'],
      },
      {
        id: 'e1',
        title: 'Harbour',
        text: 'harbour ships',
        tags: ['t-sea', 't-port'],
      },
    ]);
    const profiles = [
      buildTagProfile({ tagUuid: 't-sea', title: 'Sea' }, idf),
      buildTagProfile({ tagUuid: 't-port', title: 'Port' }, idf),
      buildTagProfile({ tagUuid: 't-ai', title: 'AI' }, idf),
    ];
    const { counts, surfaces } = readTerms({
      title: 'Evening',
      text: 'She said the sea was calm',
    });
    const recommended = recommendTags(
      {
        terms: counts,
        surfaces,
        normalizedText: normalizeTermText('Evening\nShe said the sea was calm'),
        vector: termVector(counts, idf),
        selectedTagUuids: new Set(['t-port']),
        related: [documents[0]!],
      },
      { documents, profiles, idf },
    );
    expect(recommended.map((item) => item.tagUuid)).toEqual(['t-sea']);
    expect(recommended[0]!.reasons.map((reason) => reason.kind)).toEqual([
      'text',
      'related',
    ]);
  });
});
