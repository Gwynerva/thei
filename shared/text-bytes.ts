/**
 * Whether the first bytes of a file look like text in some encoding: a byte
 * order mark, or no NUL and next to no control characters.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bomOf(bytes)) return true;
  let control = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    // Tab, line feed, form feed, carriage return and escape occur in text.
    if (byte < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d, 0x1b].includes(byte))
      control++;
  }
  return control <= bytes.length / 100;
}

/**
 * The older encoding bytes that are no UTF-8 were most likely written in,
 * told by the bytes alone. A Russian text has nearly all its letters past
 * ASCII, a Western one only a few accented ones among many plain: the first
 * is read as `cyrillic` — windows-1251 for a text, ibm866 for the names in
 * an archive a Russian Windows made — the second as windows-1252.
 */
export function guessLegacyEncoding(
  bytes: Uint8Array,
  cyrillic: 'windows-1251' | 'ibm866',
): string {
  let latin = 0;
  let beyond = 0;
  for (const byte of bytes) {
    if ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a))
      latin++;
    else if (byte >= 0x80) beyond++;
  }
  return beyond > latin / 2 ? cyrillic : 'windows-1252';
}

/**
 * The upper half of code page 437, the encoding of names in an archive that
 * an English or Western Windows made. Browsers know no decoder for it.
 */
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

/** Bytes in code page 437: ASCII below 0x80, the table above. */
export function decodeCp437(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes)
    text += byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80];
  return text;
}

function bomOf(
  bytes: Uint8Array,
): { encoding: string; length: number } | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { encoding: 'utf-8', length: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { encoding: 'utf-16le', length: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { encoding: 'utf-16be', length: 2 };
  return undefined;
}

/**
 * The words of a text's bytes. A byte order mark names the encoding; else
 * UTF-8, and bytes that are no UTF-8 are read in the older encoding they
 * look like. With `partial` the bytes stop before the file does: a character
 * cut in two at the end is left out rather than shown broken.
 */
export function decodeText(bytes: Uint8Array, partial = false): string {
  const bom = bomOf(bytes);
  if (bom)
    return new TextDecoder(bom.encoding).decode(bytes.subarray(bom.length), {
      stream: partial,
    });
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
      stream: partial,
    });
  } catch {
    return new TextDecoder(guessLegacyEncoding(bytes, 'windows-1251')).decode(
      bytes,
      { stream: partial },
    );
  }
}

/**
 * The start of a text cut where a line ends, so that its last line is never
 * half of one; a text of one long line is cut where it was.
 */
export function cutAtLastLine(text: string): string {
  const end = text.lastIndexOf('\n');
  return end > text.length / 2 ? text.slice(0, end) : text;
}
