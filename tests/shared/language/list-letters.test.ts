import { describe, expect, it } from 'vitest';
import { loadLanguage } from '../../../shared/language';
import { listLetterCounterStyles } from '../../../shared/language/list-letters';

describe('listLetterCounterStyles', () => {
  it('letters a list in Russian on a Russian site', async () => {
    const ru = await loadLanguage('ru');
    const styles = listLetterCounterStyles(ru.listLetters, ru.code);
    expect(styles).toContain(
      "@counter-style lower-alpha { system: alphabetic; symbols: 'а' 'б' 'в'",
    );
    expect(styles).toContain(
      "@counter-style upper-alpha { system: alphabetic; symbols: 'А' 'Б' 'В'",
    );
    expect(styles).not.toMatch(/'[ёйъыь]'/i);
  });

  it('leaves Latin letters to the browser', async () => {
    const en = await loadLanguage('en');
    expect(listLetterCounterStyles(en.listLetters, en.code)).toBe('');
  });
});
