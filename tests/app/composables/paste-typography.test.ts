import { describe, expect, it } from 'vitest';
import {
  bringsCopiedWords,
  clipboardWordsKey,
  rememberCopiedWords,
} from '../../../app/composables/paste-typography';

describe('words copied in the editor', () => {
  it('reads a clipboard and a selection alike', () => {
    expect(clipboardWordsKey('  a -- b\n\nc  ')).toBe('a -- b c');
    expect(clipboardWordsKey('\n  ')).toBe('');
  });

  it('knows a paste of the words last copied or cut, and no other', () => {
    rememberCopiedWords('kept a -- b');
    // The browser writes the copy's no-break space as a space.
    expect(bringsCopiedWords('kept a -- b')).toBe(true);
    expect(bringsCopiedWords('kept a — b')).toBe(false);
    expect(bringsCopiedWords('a -- b')).toBe(false);

    rememberCopiedWords('one...\ntwo');
    expect(bringsCopiedWords('one...\r\ntwo')).toBe(true);
    expect(bringsCopiedWords('kept a -- b')).toBe(false);
  });

  it('remembers nothing of a copy with no words', () => {
    rememberCopiedWords('  ');
    expect(bringsCopiedWords('')).toBe(false);
    expect(bringsCopiedWords(' ')).toBe(false);
  });
});
