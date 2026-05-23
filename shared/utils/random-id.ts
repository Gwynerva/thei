const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MAX_BYTE = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function randomId(length: number, variation = 4): string {
  if (variation > 0) {
    const range = variation * 2 + 1;
    const maxByte = Math.floor(256 / range) * range;
    const buf = new Uint8Array(1);
    let b0: number;
    do {
      crypto.getRandomValues(buf);
      b0 = buf[0]!;
    } while (b0 >= maxByte);
    length = Math.max(0, length + (b0 % range) - variation);
  }

  let result = '';
  while (result.length < length) {
    const bytes = new Uint8Array(length - result.length + 8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < MAX_BYTE) {
        result += ALPHABET[b % ALPHABET.length];
        if (result.length === length) break;
      }
    }
  }
  return result;
}
