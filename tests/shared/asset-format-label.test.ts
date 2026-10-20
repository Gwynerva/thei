import { describe, expect, it } from 'vitest';
import { assetFormatName } from '../../shared/asset-format-label';
import enModule from '../../shared/language/list/en';
import ruModule from '../../shared/language/list/ru';

/**
 * A file named by what it is, wherever it has no title to go by — the
 * admin's pages, a visitor's window, a session's title on the server.
 */
describe('a file named by what it is', () => {
  const en = enModule.phrases;

  it('goes by its kind, or by the format a person knows it as', () => {
    expect(assetFormatName(en, 'jpg')).toBe(en.image);
    expect(assetFormatName(en, 'mp3')).toBe(en.audio);
    expect(assetFormatName(en, 'pdf')).toBe('PDF document');
    expect(
      assetFormatName(en, 'zip', { extension: 'pdf', size: 1 } as never),
    ).toBe('PDF document');
  });

  it('is never left without a word, whatever its format', () => {
    for (const phrase of [en, ruModule.phrases]) {
      expect(assetFormatName(phrase, 'xyz')).toContain('XYZ');
      expect(assetFormatName(phrase, '').trim()).not.toBe('');
    }
  });
});
