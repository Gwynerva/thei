import { describe, expect, it } from 'vitest';
import { packIco } from '../../server/thei/media/favicon';

describe('packIco', () => {
  it('writes a container every browser can read', () => {
    const frames = [Buffer.from('a'.repeat(10)), Buffer.from('b'.repeat(20))];
    const ico = packIco(frames, [16, 32]);

    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // two frames

    const first = 6;
    expect(ico.readUInt8(first)).toBe(16);
    expect(ico.readUInt32LE(first + 8)).toBe(10);
    expect(ico.readUInt32LE(first + 12)).toBe(6 + 32);

    const second = 6 + 16;
    expect(ico.readUInt8(second)).toBe(32);
    expect(ico.readUInt32LE(second + 8)).toBe(20);
    expect(ico.readUInt32LE(second + 12)).toBe(6 + 32 + 10);

    expect(ico.length).toBe(6 + 32 + 30);
  });

  it('writes 256 as zero, which is how the format says "256"', () => {
    const ico = packIco([Buffer.from('x')], [256]);
    expect(ico.readUInt8(6)).toBe(0);
    expect(ico.readUInt8(7)).toBe(0);
  });
});
