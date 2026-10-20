import { describe, expect, it } from 'vitest';
import { identityKey, termKey } from '../../shared/identity-key';

/**
 * The keys the database keeps: a change here changes stored rows, and needs
 * an update task that counts them again (`0.0.7/002-identity-keys`).
 */
describe('identity keys', () => {
  it('stay as stored', () => {
    expect(identityKey('I')).toBe('i');
    expect(identityKey('İ')).toBe('i̇');
    expect(identityKey('ß')).toBe('ß');
    expect(identityKey('ﬁ')).toBe('fi');
    expect(identityKey('Ёлка')).toBe('елка');
    expect(identityKey('ёлка')).toBe('елка');
    expect(identityKey('Café')).toBe('café');
    expect(identityKey('Ｃｏｓｐｌａｙ')).toBe('cosplay');
  });

  it('fold the spaces of a dictionary word', () => {
    expect(termKey('  Большая   Медведица ')).toBe('большая медведица');
    expect(termKey('Istanbul')).toBe('istanbul');
  });
});
