import { describe, expect, it } from 'vitest';
import {
  cutAtLastLine,
  decodeCp437,
  decodeText,
  guessLegacyEncoding,
  looksLikeText,
} from '../../shared/text-bytes';

const utf8 = (text: string) => new TextEncoder().encode(text);
/** «Привет, мир» as an old Russian notepad saves it. */
const cp1251 = new Uint8Array([
  0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xec, 0xe8, 0xf0,
]);
/** «Café crème brûlée» in windows-1252. */
const cp1252 = new Uint8Array([
  0x43, 0x61, 0x66, 0xe9, 0x20, 0x63, 0x72, 0xe8, 0x6d, 0x65, 0x20, 0x62, 0x72,
  0xfb, 0x6c, 0xe9, 0x65,
]);

describe('code page 437', () => {
  it('reads every byte as one character of the table', () => {
    const all = new Uint8Array(256).map((_, index) => index);
    const text = decodeCp437(all);
    expect([...text]).toHaveLength(256);
    expect(text.slice(0, 128)).toBe(String.fromCharCode(...all.slice(0, 128)));
    expect(decodeCp437(new Uint8Array([0x80, 0x9a, 0xe1, 0xff]))).toBe(
      'ÇÜß' + String.fromCharCode(0xa0),
    );
  });
});

describe('text bytes', () => {
  it('tells text from other bytes', () => {
    expect(looksLikeText(utf8('Поход по Карелии\r\n\tдень 1'))).toBe(true);
    expect(looksLikeText(cp1251)).toBe(true);
    expect(looksLikeText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(
      false,
    );
    expect(looksLikeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe(true);
    expect(looksLikeText(new Uint8Array(200).fill(0x01))).toBe(false);
  });

  it('tells a Cyrillic older encoding from a Western one by the letters', () => {
    expect(guessLegacyEncoding(cp1251, 'windows-1251')).toBe('windows-1251');
    expect(guessLegacyEncoding(cp1252, 'windows-1251')).toBe('windows-1252');
    // «Поход.txt» as a Russian Windows archiver names it.
    expect(
      guessLegacyEncoding(
        new Uint8Array([0x8f, 0xae, 0xe5, 0xae, 0xa4, 0x2e, 0x74, 0x78, 0x74]),
        'ibm866',
      ),
    ).toBe('ibm866');
  });

  it('reads UTF-8, a byte order mark, and an older encoding', () => {
    expect(decodeText(utf8('Привет'))).toBe('Привет');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x1f, 0x04]))).toBe('П');
    expect(decodeText(cp1251)).toBe('Привет, мир');
    expect(decodeText(cp1252)).toBe('Café crème brûlée');
  });

  it('leaves out a character cut in two at the end of a part', () => {
    const bytes = utf8('Да');
    expect(decodeText(bytes.subarray(0, bytes.length - 1), true)).toBe('Д');
  });

  it('cuts the start of a text where a line ends', () => {
    expect(cutAtLastLine('one\ntwo\nthr')).toBe('one\ntwo');
    expect(cutAtLastLine('a\nlong single line')).toBe('a\nlong single line');
  });
});
