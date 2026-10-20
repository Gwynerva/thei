import { describe, expect, it } from 'vitest';
import { formNeedsWords } from '../../../app/composables/form-needs';
import type { LanguagePhrases } from '../../../shared/language/types';
import enModule from '../../../shared/language/list/en';
import ruModule from '../../../shared/language/list/ru';

const en = enModule.phrases as LanguagePhrases;
const ru = ruModule.phrases as LanguagePhrases;

const empty = (label: string) => ({ key: label, label });
const wrong = (label: string, problem: string) => ({
  key: label,
  label,
  problem,
});

describe('formNeedsWords', () => {
  it('says empty fields together and each field to correct with its fault', () => {
    expect(
      formNeedsWords(en, [
        empty('Title'),
        empty('Summary'),
        wrong('Page address', 'A page with this slug already exists.'),
      ]),
    ).toEqual([
      'Still to fill in: Title, Summary',
      'Page address: A page with this slug already exists.',
    ]);
  });

  it('keeps the line short: three empty fields named, the rest counted', () => {
    const five = ['A', 'B', 'C', 'D', 'E'].map(empty);
    expect(formNeedsWords(en, five, true)).toEqual([
      'Still to fill in: A, B, C and 2 more',
    ]);
    // The hint names them all.
    expect(formNeedsWords(en, five)).toEqual([
      'Still to fill in: A, B, C, D, E',
    ]);
    expect(formNeedsWords(ru, five, true)).toEqual([
      'Осталось заполнить: A, B, C и ещё 2',
    ]);
  });

  it('names fields to correct without their fault when the line says more', () => {
    const needs = [
      ...['A', 'B', 'C', 'D'].map(empty),
      wrong('Action button', 'provide button text'),
    ];
    expect(formNeedsWords(en, needs, true)).toEqual([
      'Still to fill in: A, B and 2 more',
      'To correct: Action button',
    ]);
    expect(formNeedsWords(ru, needs, true)).toEqual([
      'Осталось заполнить: A, B и ещё 2',
      'Исправить: Action button',
    ]);
  });

  it('says a single field to correct whole, even on the line', () => {
    expect(
      formNeedsWords(en, [wrong('Site Address', 'not a full address')], true),
    ).toEqual(['Site Address: not a full address']);
  });

  it('says nothing when nothing is needed', () => {
    expect(formNeedsWords(en, [])).toEqual([]);
    expect(formNeedsWords(en, [], true)).toEqual([]);
  });
});
