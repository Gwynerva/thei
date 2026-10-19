import { describe, expect, it } from 'vitest';
import { createSearchAnalyzer } from '../../../shared/language/search';
import {
  parseSearchQuery,
  requiredQueryWords,
  searchTokens,
} from '../../../shared/search/tokens';
import { snippetSegments } from '../../../shared/search/snippet';

const ru = createSearchAnalyzer('ru');
const en = createSearchAnalyzer('en');
const terms = (text: string, analyzer = ru) =>
  searchTokens(text, analyzer).map((token) => token.term);
const term = (word: string, analyzer = ru) => terms(word, analyzer)[0];
const query = (text: string, typing = false) =>
  parseSearchQuery(text, ru, { typing });

describe('search words', () => {
  it.each([
    ['косплей', 'косплея', 'косплеем', 'косплеи'],
    ['Шедоухарт', 'Шедоухарта', 'Шедоухарту'],
    ['день', 'дня', 'дней'],
    ['заметок', 'заметка', 'заметки'],
    ['конец', 'конца'],
    ['отец', 'отца'],
    ['уровень', 'уровня'],
    ['ушёл', 'ушла', 'ушли'],
    ['сон', 'сна'],
    ['любовь', 'любви'],
    ['ветер', 'ветра'],
    ['ёлка', 'елка', 'ёлки'],
    ['Лёша', 'Леша'],
    ['travel', 'travelling', 'travelled'],
    ['café', 'cafe', 'Cafe'],
    ['Müller', 'Muller'],
  ])('reads %s and its forms as one word', (...forms) => {
    expect(new Set(forms.map((form) => term(form))).size).toBe(1);
  });

  it.each([
    ['кот', 'который'],
    ['мир', 'мираж'],
    ['двор', 'дверь'],
  ])('keeps %s apart from %s', (left, right) => {
    expect(term(left)).not.toBe(term(right));
  });

  it('reads a word by its own script, whatever the site speaks', () => {
    expect(term('releases', ru)).toBe(term('release', en));
    expect(term('косплея', en)).toBe(term('косплей', ru));
  });

  it('keeps short names as written', () => {
    expect(terms('2B, 9S и A2 из NieR')).toEqual([
      '2b',
      '9s',
      'и',
      'a2',
      'из',
      'nier',
    ]);
    expect(terms('JS, TS, BG3, ps5, x86, 4K, МГУ, ВК')).toEqual([
      'js',
      'ts',
      'bg3',
      'ps5',
      'x86',
      '4k',
      'мгу',
      'вк',
    ]);
    expect(query('мгу').words[0]!.terms).toContain('мгу');
    expect(query('дня').words[0]!.terms).toContain(term('день'));
    expect(query('IT проекты').words[0]!.stop).toBe(false);
  });

  it('keeps C++, C# and .NET whole', () => {
    expect(terms('учу C++ и C#, а .NET — нет').slice(0, 5)).toEqual([
      term('учу'),
      'c++',
      'и',
      'c#',
      'а',
    ]);
    expect(terms('а .NET')).toContain('.net');
  });

  it('gives a dotted word whole and in parts, and asks for its parts', () => {
    expect(terms('Vue.js и NieR:Automata')).toEqual([
      'vue.js',
      'vue',
      'js',
      'и',
      'nier:automata',
      'nier',
      'automata',
    ]);
    expect(query('Vue.js').words.map((word) => word.term)).toEqual([
      'vue',
      'js',
    ]);
  });

  it('gives hyphened words apart and together, and asks for them together', () => {
    expect(terms('e-mail', en)).toEqual(['e', 'mail', 'email']);
    expect(
      parseSearchQuery('e-mail', en).words.map((word) => word.term),
    ).toEqual(['email']);
    expect(
      parseSearchQuery('email', en).words.map((word) => word.term),
    ).toEqual(['email']);
  });

  it('places every word in the text as given', () => {
    const text = '«Ёлка» … и C++!';
    for (const token of searchTokens(text, ru))
      expect(text.slice(token.start, token.end).toLowerCase()).toBe(
        token.word === 'елка' ? 'ёлка' : token.word,
      );
  });
});

describe('search queries', () => {
  it('does not insist on words that only hold a sentence together', () => {
    expect(
      requiredQueryWords(query('фото с фестиваля')).map((w) => w.word),
    ).toEqual(['фото', 'фестиваля']);
    expect(requiredQueryWords(query('и')).map((w) => w.word)).toEqual(['и']);
  });

  it('reads the last word as unfinished while typing', () => {
    expect(query('косплей шедо', true).words.map((w) => w.prefix)).toEqual([
      false,
      true,
    ]);
    expect(query('косплей шедо ', true).words.at(-1)!.prefix).toBe(false);
    expect(query('косплей шедо').words.at(-1)!.prefix).toBe(false);
  });

  it('takes phrases in quotes apart', () => {
    const parsed = query('"старый маяк" фото');
    expect(parsed.phrases).toEqual([[term('старый'), term('маяк')]]);
    expect(parsed.words.map((w) => w.word)).toEqual(['фото']);
  });

  it('reads a query typed on the other keyboard', () => {
    expect(ru.otherKeyboard(',e,kbr')).toBe('бублик');
    // A Latin word of a text is found by the site's letters too.
    expect(ru.fromLatin('eva')).toBe(ru.read('евы').term);
    expect(ru.fromLatin('blender')).toBe(ru.read('блендере').term);
    expect(ru.fromLatin('ева')).toBeUndefined();
    expect(en.fromLatin('eva')).toBe(ru.fromLatin('eva'));
    expect(ru.otherKeyboard('rjcgktq')).toBe('косплей');
    expect(ru.otherKeyboard('бублик')).toBe(',e,kbr');
    expect(ru.otherKeyboard('vue 3')).toBe('мгу 3');
    expect(en.otherKeyboard('rjcgktq')).toBe('косплей');
  });
});

describe('search snippets', () => {
  it('marks what was found, in the text as given', () => {
    const text = 'Дошила плащ для косплея. Завтра примерка с париком.';
    const hits = searchTokens(text, ru).filter(
      (token) => token.term === term('косплей'),
    );
    expect(snippetSegments(text, hits)).toEqual([
      { text: 'Дошила плащ для ' },
      { text: 'косплея', mark: true },
      { text: '. Завтра примерка с париком.' },
    ]);
  });

  it('cuts a long text around the find', () => {
    const text = `${'слово '.repeat(60)}маяк ${'слово '.repeat(60)}`;
    const hits = searchTokens(text, ru).filter(
      (token) => token.word === 'маяк',
    );
    const segments = snippetSegments(text, hits, 80);
    expect(segments[0]).toEqual({ text: '…' });
    expect(segments.at(-1)).toEqual({ text: '…' });
    expect(segments.find((segment) => segment.mark)?.text).toBe('маяк');
  });
});
