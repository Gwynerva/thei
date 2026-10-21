import { describe, expect, it } from 'vitest';
import { createSearchAnalyzer } from '../../../shared/language/search';
import { isQuestion as asks } from '../../../shared/search/tokens';

const ru = createSearchAnalyzer('ru');
const isQuestion = (text: string) => asks(text, ru);

/** A question typed into the quick search is asked, not made a title of. */
describe('a question typed', () => {
  it('is told by its first word or its mark', () => {
    expect(isQuestion('что я делала на байкале')).toBe(true);
    expect(isQuestion('Когда был переезд')).toBe(true);
    expect(isQuestion('where did I go')).toBe(true);
    expect(isQuestion('байкал?')).toBe(true);
  });

  it('is not a title or a word alone', () => {
    expect(isQuestion('Ярмарка мастеров')).toBe(false);
    expect(isQuestion('что')).toBe(false);
    expect(isQuestion('Как я веду этот архив')).toBe(true);
  });
});
