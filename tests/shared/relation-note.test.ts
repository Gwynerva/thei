import { describe, expect, it } from 'vitest';
import {
  mergeRelationNote,
  relationHasNote,
  splitRelationNote,
} from '../../shared/relation';
import {
  relationLabel,
  relationSentenceParts,
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
    expect(relationLabel(en, 'influencing')).toBe('Influences');
    expect(relationLabel(en, 'dependent')).toBe('Depends');
  });
});

describe('relationSentenceParts', () => {
  it('leaves the names out, their quotes with them', () => {
    expect(relationSentenceParts(ru, 'influencing')).toEqual([
      { side: 'current' },
      ' зависит от ',
      { side: 'other' },
    ]);
    expect(relationSentenceParts(ru, 'related')).toEqual([
      { side: 'current' },
      ' и ',
      { side: 'other' },
      ' связаны',
    ]);
    expect(relationSentenceParts(en, 'dependent')).toEqual([
      { side: 'current' },
      ' affects ',
      { side: 'other' },
    ]);
  });
});
