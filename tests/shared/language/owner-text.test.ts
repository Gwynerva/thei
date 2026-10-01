import { describe, expect, it } from 'vitest';
import { ownerTextFormatter } from '../../../shared/language/owner-text';
import { loadLanguage } from '../../../shared/language';

describe('ownerTextFormatter', () => {
  it("gives the owner's plain text the language's typography", async () => {
    const { text } = ownerTextFormatter((await loadLanguage('ru')).normalize);
    expect(text('"Проверка" -- в доме...')).toBe(
      '«Проверка»\u00a0— в\u00a0доме…',
    );
    expect(text('')).toBe('');
    expect(text(undefined)).toBe('');
  });

  it('leaves the tags and attributes of inline markup alone', async () => {
    const { richText } = ownerTextFormatter(
      (await loadLanguage('en')).normalize,
    );
    expect(richText('<a href="/a--b/">it\'s "here"</a>')).toBe(
      '<a href="/a--b/">it’s “here”</a>',
    );
  });

  it('is safe to apply twice', async () => {
    const { text } = ownerTextFormatter((await loadLanguage('ru')).normalize);
    const once = text('"Проверка" -- в доме...');
    expect(text(once)).toBe(once);
  });
});
