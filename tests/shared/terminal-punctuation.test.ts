import { describe, expect, it } from 'vitest';
import {
  normalizeCaptionText,
  normalizeHeadingText,
  punctuateInlineHtml,
} from '../../shared/terminal-punctuation';

/** [input, caption, heading] */
const CASES: [string, string, string][] = [
  // One sentence takes no full stop, however long; a heading never does.
  ['Кот на окне.', 'Кот на окне', 'Кот на окне'],
  ['Cat on a sill.', 'Cat on a sill', 'Cat on a sill'],
  [
    'Мы с братом на крыше дома, где провели всё лето.',
    'Мы с братом на крыше дома, где провели всё лето',
    'Мы с братом на крыше дома, где провели всё лето',
  ],
  ['Кот на окне', 'Кот на окне', 'Кот на окне'],
  // Several sentences end with a mark; a heading drops the last one.
  ['Кот спит. Пёс лает', 'Кот спит. Пёс лает.', 'Кот спит. Пёс лает'],
  ['Кот спит. Пёс лает.', 'Кот спит. Пёс лает.', 'Кот спит. Пёс лает'],
  [
    'The cat sleeps. The dog barks',
    'The cat sleeps. The dog barks.',
    'The cat sleeps. The dog barks',
  ],
  ['Кот спит! Пёс лает', 'Кот спит! Пёс лает.', 'Кот спит! Пёс лает'],
  ['Ждём… Кот пришёл', 'Ждём… Кот пришёл.', 'Ждём… Кот пришёл'],
  ['Кот спит. «Пёс» лает', 'Кот спит. «Пёс» лает.', 'Кот спит. «Пёс» лает'],
  ['Кот спит. — Да', 'Кот спит. — Да.', 'Кот спит. — Да'],
  [
    'Кот спит. 3 кота рядом',
    'Кот спит. 3 кота рядом.',
    'Кот спит. 3 кота рядом',
  ],
  ['Кот спит.\nПёс лает', 'Кот спит.\nПёс лает.', 'Кот спит.\nПёс лает'],
  // Expressive endings stay as typed.
  ['Кот?', 'Кот?', 'Кот?'],
  ['Кот!', 'Кот!', 'Кот!'],
  ['Кот…', 'Кот…', 'Кот…'],
  ['Кот...', 'Кот...', 'Кот...'],
  ['Кто?!', 'Кто?!', 'Кто?!'],
  ['Неужели?..', 'Неужели?..', 'Неужели?..'],
  ['Кот спит. Пёс лает...', 'Кот спит. Пёс лает...', 'Кот спит. Пёс лает...'],
  // Stray marks and spaces.
  ['Кот .', 'Кот', 'Кот'],
  ['Кот !', 'Кот!', 'Кот!'],
  ['Кот..', 'Кот', 'Кот'],
  ['Кот,', 'Кот', 'Кот'],
  ['Кот;', 'Кот', 'Кот'],
  ['Кот  ', 'Кот', 'Кот'],
  ['Кот спит. Пёс лает;', 'Кот спит. Пёс лает.', 'Кот спит. Пёс лает'],
  ['Кот спит. Пёс лает ,', 'Кот спит. Пёс лает.', 'Кот спит. Пёс лает'],
  // A full stop that closes an abbreviation stays.
  ['Москва, 1990 г.', 'Москва, 1990 г.', 'Москва, 1990 г.'],
  ['Пушкин А. С.', 'Пушкин А. С.', 'Пушкин А. С.'],
  ['XIX в.', 'XIX в.', 'XIX в.'],
  [
    'Книги, журналы и т. д.',
    'Книги, журналы и т. д.',
    'Книги, журналы и т. д.',
  ],
  ['Книги, журналы и т.д.', 'Книги, журналы и т.д.', 'Книги, журналы и т.д.'],
  ['Рим, II в. до н. э.', 'Рим, II в. до н. э.', 'Рим, II в. до н. э.'],
  ['Fruit, e.g.', 'Fruit, e.g.', 'Fruit, e.g.'],
  ['Smith et al.', 'Smith et al.', 'Smith et al.'],
  ['Acme Inc.', 'Acme Inc.', 'Acme Inc.'],
  ['Тираж 3 тыс.', 'Тираж 3 тыс.', 'Тираж 3 тыс.'],
  ['Собор св. Петра.', 'Собор св. Петра', 'Собор св. Петра'],
  // Initials and abbreviations do not start a sentence.
  [
    'А. С. Пушкин в Михайловском.',
    'А. С. Пушкин в Михайловском',
    'А. С. Пушкин в Михайловском',
  ],
  [
    'J. R. R. Tolkien at home.',
    'J. R. R. Tolkien at home',
    'J. R. R. Tolkien at home',
  ],
  ['Дом на ул. Ленина.', 'Дом на ул. Ленина', 'Дом на ул. Ленина'],
  ['Visiting Dr. Smith.', 'Visiting Dr. Smith', 'Visiting Dr. Smith'],
  // A figure's number is a label.
  ['Рис. 3. Кот на окне.', 'Рис. 3. Кот на окне', 'Рис. 3. Кот на окне'],
  ['3. Кот.', '3. Кот', '3. Кот'],
  ['1.2. Схема.', '1.2. Схема', '1.2. Схема'],
  ['IV. Финал.', 'IV. Финал', 'IV. Финал'],
  ['Figure 3. A cat.', 'Figure 3. A cat', 'Figure 3. A cat'],
  // Quotations and brackets.
  [
    'Кот спит. Пёс сказал «гав»',
    'Кот спит. Пёс сказал «гав».',
    'Кот спит. Пёс сказал «гав»',
  ],
  [
    'Кот спит. Пёс спросил «где?»',
    'Кот спит. Пёс спросил «где?»',
    'Кот спит. Пёс спросил «где?»',
  ],
  [
    'Кот спит. Пёс (см. рис.)',
    'Кот спит. Пёс (см. рис.)',
    'Кот спит. Пёс (см. рис.)',
  ],
  ['Картина «Утро».', 'Картина «Утро»', 'Картина «Утро»'],
  ['Кот (рыжий).', 'Кот (рыжий)', 'Кот (рыжий)'],
  ['The "Cat."', 'The "Cat."', 'The "Cat."'],
  // A question in the middle of one sentence.
  [
    'Кто там? — спросил кот.',
    'Кто там? — спросил кот',
    'Кто там? — спросил кот',
  ],
  // Endings that are not open: nothing is added after them.
  ['Кот спит. Пёс :)', 'Кот спит. Пёс :)', 'Кот спит. Пёс :)'],
  ['Кот спит. Пёс 🐶', 'Кот спит. Пёс 🐶', 'Кот спит. Пёс 🐶'],
  ['Кот спит. Пёс:', 'Кот спит. Пёс:', 'Кот спит. Пёс:'],
  ['Кот спит. Рост 5%', 'Кот спит. Рост 5%.', 'Кот спит. Рост 5%'],
  // Words that merely look like abbreviations at the end.
  ['Это был я.', 'Это был я', 'Это был я'],
  ['Всё ок.', 'Всё ок', 'Всё ок'],
  ['Спасибо им.', 'Спасибо им', 'Спасибо им'],
  ['Say no.', 'Say no', 'Say no'],
  ['Version 2.0.', 'Version 2.0', 'Version 2.0'],
  ['Печать 3D.', 'Печать 3D', 'Печать 3D'],
  ['Нью-Йорк.', 'Нью-Йорк', 'Нью-Йорк'],
  ['Глава 1.', 'Глава 1', 'Глава 1'],
  // Nothing to judge.
  ['.', '.', '.'],
  ['...', '...', '...'],
  ['', '', ''],
  // A known limit: an abbreviation before a capital is not a sentence end.
  [
    'Москва, 1990 г. Фото автора.',
    'Москва, 1990 г. Фото автора',
    'Москва, 1990 г. Фото автора',
  ],
];

describe('normalizeCaptionText', () => {
  it.each(CASES)('%j', (input, caption) => {
    expect(normalizeCaptionText(input)).toBe(caption);
  });

  it.each(CASES)('is idempotent on %j', (input) => {
    const once = normalizeCaptionText(input);
    expect(normalizeCaptionText(once)).toBe(once);
  });
});

describe('normalizeHeadingText', () => {
  it.each(CASES)('%j', (input, _caption, heading) => {
    expect(normalizeHeadingText(input)).toBe(heading);
  });

  it.each(CASES)('is idempotent on %j', (input) => {
    const once = normalizeHeadingText(input);
    expect(normalizeHeadingText(once)).toBe(once);
  });
});

describe('punctuateInlineHtml', () => {
  it.each([
    ['<i>Кот.</i>', '<i>Кот</i>'],
    ['Кот <b>на окне</b>.', 'Кот <b>на окне</b>'],
    [
      'Кот спит. <a href="https://example.com/">Пёс</a>',
      'Кот спит. <a href="https://example.com/">Пёс</a>.',
    ],
    ['Кот спит. <b>Пёс <i>лает</i></b>', 'Кот спит. <b>Пёс <i>лает</i></b>.'],
    ['Кот <b>.</b>', 'Кот<b></b>'],
    ['Том &amp; Джерри.', 'Том &amp; Джерри'],
    ['Кот спит. A &lt; B', 'Кот спит. A &lt; B.'],
    ['AT&amp;T Inc.', 'AT&amp;T Inc.'],
    ['Пушкин<br>1830 г.', 'Пушкин<br>1830 г.'],
    ['Кот&nbsp;.', 'Кот'],
    ['Кот спит. Пёс лает.', 'Кот спит. Пёс лает.'],
    [
      '<a data-content-link="entity" data-entity-type="project" data-entity-id="p1">Дом.</a>',
      '<a data-content-link="entity" data-entity-type="project" data-entity-id="p1">Дом</a>',
    ],
  ])('captions %j', (input, output) => {
    expect(punctuateInlineHtml(input, 'caption')).toBe(output);
  });

  it('never appends to a heading', () => {
    expect(punctuateInlineHtml('Кот спит. <b>Пёс</b>.', 'heading')).toBe(
      'Кот спит. <b>Пёс</b>',
    );
  });

  it('leaves markup it does not change byte for byte', () => {
    const html = 'Кот <b>спит</b> &laquo;тихо&raquo;';
    expect(punctuateInlineHtml(html, 'caption')).toBe(html);
  });
});
