import { describe, expect, it } from 'vitest';
import {
  mergeRelationNote,
  relationHasNote,
  splitRelationNote,
} from '../../shared/relation';
import {
  relationLabel,
  relationSentencePartsFromOther,
} from '../../shared/relation-display';
import type { LanguagePhrases } from '../../shared/language/types';
import enModule from '../../shared/language/list/en';
import ruModule from '../../shared/language/list/ru';

const en = enModule.phrases as LanguagePhrases;
const ru = { ...en, ...ruModule.phrases } as LanguagePhrases;

describe('a relation note made one per side and one again', () => {
  it('starts each side from what was written for both', () => {
    expect(splitRelationNote({ type: 'shared', text: 'Gave it maps' })).toEqual(
      {
        type: 'split',
        currentText: 'Gave it maps',
        relatedText: 'Gave it maps',
      },
    );
    expect(splitRelationNote(undefined)).toEqual({
      type: 'split',
      currentText: '',
      relatedText: '',
    });
  });

  it('keeps a note that is already per side', () => {
    const note = { type: 'split' as const, currentText: 'Here' };
    expect(splitRelationNote(note)).toBe(note);
  });

  it('loses nothing written when merged', () => {
    const merge = (currentText?: string, relatedText?: string) =>
      mergeRelationNote({ type: 'split', currentText, relatedText });
    expect(merge('Same', 'Same')).toEqual({ type: 'shared', text: 'Same' });
    expect(merge('Here', undefined)).toEqual({ type: 'shared', text: 'Here' });
    expect(merge(undefined, 'There')).toEqual({
      type: 'shared',
      text: 'There',
    });
    expect(merge('Here', 'There')).toEqual({
      type: 'shared',
      text: 'Here — There',
    });
    expect(merge()).toEqual({ type: 'shared', text: '' });
  });

  it('says whether either side says anything', () => {
    expect(relationHasNote(undefined)).toBe(false);
    expect(relationHasNote({ type: 'shared', text: '  ' })).toBe(false);
    expect(relationHasNote({ type: 'shared', text: 'Why' })).toBe(true);
    expect(relationHasNote({ type: 'split', relatedText: 'There' })).toBe(true);
    expect(relationHasNote({ type: 'split', currentText: '' })).toBe(false);
  });
});

describe('relationLabel', () => {
  it('says what the other end is to this one', () => {
    expect(relationLabel(ru, 'related')).toBe('Связан');
    expect(relationLabel(ru, 'influencing')).toBe('Влияет');
    expect(relationLabel(ru, 'dependent')).toBe('Зависит');
    expect(relationLabel(en, 'influencing')).toBe('Affects');
    expect(relationLabel(en, 'dependent')).toBe('Depends on');
  });
});

describe('relationSentencePartsFromOther', () => {
  it('says each kind of the other end, in the word its label wears', () => {
    expect(relationSentencePartsFromOther(en, 'influencing')).toEqual([
      { side: 'other' },
      ' affects ',
      { side: 'current' },
    ]);
    expect(relationLabel(en, 'influencing')).toBe('Affects');
    expect(relationSentencePartsFromOther(en, 'dependent')).toEqual([
      { side: 'other' },
      ' depends on ',
      { side: 'current' },
    ]);
    expect(relationLabel(en, 'dependent')).toBe('Depends on');
    expect(relationSentencePartsFromOther(ru, 'influencing')).toEqual([
      { side: 'other' },
      ' влияет на ',
      { side: 'current' },
    ]);
    expect(relationLabel(ru, 'influencing')).toBe('Влияет');
    expect(relationSentencePartsFromOther(ru, 'dependent')).toEqual([
      { side: 'other' },
      ' зависит от ',
      { side: 'current' },
    ]);
    expect(relationLabel(ru, 'dependent')).toBe('Зависит');
    expect(relationSentencePartsFromOther(en, 'related')).toEqual([
      { side: 'other' },
      ' and ',
      { side: 'current' },
      ' are related',
    ]);
  });
});

describe('relationSentencePartsFromOther', () => {
  it('leaves the names out, their quotes with them', () => {
    expect(relationSentencePartsFromOther(ru, 'related')).toEqual([
      { side: 'other' },
      ' и ',
      { side: 'current' },
      ' связаны',
    ]);
  });
});
