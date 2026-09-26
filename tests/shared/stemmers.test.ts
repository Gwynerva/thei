import { describe, expect, it } from 'vitest';
import { stemEnglish } from '../../shared/language/stemmers/english';
import { stemRussian } from '../../shared/language/stemmers/russian';

describe('English stemmer', () => {
  // From the sample vocabulary published with the Snowball algorithm.
  it.each([
    ['consign', 'consign'],
    ['consigned', 'consign'],
    ['consigning', 'consign'],
    ['consignment', 'consign'],
    ['consist', 'consist'],
    ['consisted', 'consist'],
    ['consistency', 'consist'],
    ['consistent', 'consist'],
    ['consistently', 'consist'],
    ['consisting', 'consist'],
    ['consists', 'consist'],
    ['consolation', 'consol'],
    ['consolations', 'consol'],
    ['consolatory', 'consolatori'],
    ['console', 'consol'],
    ['consoled', 'consol'],
    ['consoles', 'consol'],
    ['consolidate', 'consolid'],
    ['consolidated', 'consolid'],
    ['consolidating', 'consolid'],
    ['consoling', 'consol'],
    ['consolingly', 'consol'],
    ['consols', 'consol'],
    ['consonant', 'conson'],
    ['consort', 'consort'],
    ['consorted', 'consort'],
    ['consorting', 'consort'],
    ['conspicuous', 'conspicu'],
    ['conspicuously', 'conspicu'],
    ['conspiracy', 'conspiraci'],
    ['conspirator', 'conspir'],
    ['conspirators', 'conspir'],
    ['conspire', 'conspir'],
    ['conspired', 'conspir'],
    ['conspiring', 'conspir'],
    ['constable', 'constabl'],
    ['constables', 'constabl'],
    ['constance', 'constanc'],
    ['constancy', 'constanc'],
    ['constant', 'constant'],
    ['generously', 'generous'],
    ['skies', 'sky'],
    ['ties', 'tie'],
    ['cries', 'cri'],
    ['gaps', 'gap'],
    ['gas', 'gas'],
    ['hopping', 'hop'],
    ['hoping', 'hope'],
  ])('%s → %s', (word, stem) => {
    expect(stemEnglish(word)).toBe(stem);
  });

  it('brings the forms of one word together', () => {
    const forms = ['travel', 'travels', 'travelled', 'travelling'];
    expect(new Set(forms.map(stemEnglish))).toEqual(new Set(['travel']));
  });
});

describe('Russian stemmer', () => {
  it.each([
    ['вагон', 'вагон'],
    ['вагона', 'вагон'],
    ['вагоне', 'вагон'],
    ['вагонов', 'вагон'],
    ['важно', 'важн'],
    ['важного', 'важн'],
    ['важнейшие', 'важн'],
    ['ваша', 'ваш'],
  ])('%s → %s', (word, stem) => {
    expect(stemRussian(word)).toBe(stem);
  });

  it.each([
    [['путешествие', 'путешествия', 'путешествием', 'путешествиях']],
    [['музыка', 'музыки', 'музыкой', 'музыке']],
    [['дизайн', 'дизайна', 'дизайном', 'дизайне']],
    [['исследование', 'исследования', 'исследованием']],
    [['экспедиция', 'экспедиции', 'экспедицией']],
    [['море', 'моря', 'морем', 'морю']],
  ])('brings %j together', (forms) => {
    expect(new Set(forms.map(stemRussian)).size).toBe(1);
  });

  it('reads ё as е', () => {
    expect(stemRussian('ёлка')).toBe(stemRussian('елка'));
  });
});
