import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeIco, isIco } from '../../server/thei/external-links/ico';
import {
  convertExternalLinkFavicon,
  EXTERNAL_LINK_FAVICON_SIZE,
} from '../../server/thei/external-links/favicon';

type Pixel = [red: number, green: number, blue: number, alpha: number];

/** An icon file holding the given images, as Windows writes one. */
function icoFile(
  images: Array<{ size: number; bitCount: number; data: Buffer }>,
) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + index * 16;
    header.writeUInt8(image.size % 256, at);
    header.writeUInt8(image.size % 256, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(image.bitCount, at + 6);
    header.writeUInt32LE(image.data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

function bitmapHeader(size: number, bitCount: number, usedColors = 0) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(bitCount, 14);
  header.writeUInt32LE(usedColors, 32);
  return header;
}

/** A mask, top row first, where `true` is transparent. */
function mask(size: number, transparent: (x: number, y: number) => boolean) {
  const stride = Math.ceil(size / 32) * 4;
  const rows = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      if (transparent(x, y))
        rows[(size - 1 - y) * stride + (x >> 3)]! |= 0x80 >> (x & 7);
  return rows;
}

/** A 32-bit bitmap, top row first. */
function bitmap32(size: number, pixel: (x: number, y: number) => Pixel) {
  const rows = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const [red, green, blue, alpha] = pixel(x, y);
      rows.set([blue, green, red, alpha], ((size - 1 - y) * size + x) * 4);
    }
  return Buffer.concat([bitmapHeader(size, 32), rows, mask(size, () => false)]);
}

/** A 24-bit bitmap in one colour, top row first. */
function bitmap24(size: number, [red, green, blue]: Pixel) {
  const stride = Math.ceil((size * 24) / 32) * 4;
  const rows = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      rows.set([blue, green, red], y * stride + x * 3);
  return Buffer.concat([bitmapHeader(size, 24), rows, mask(size, () => false)]);
}

function pixelAt(
  image: ReturnType<typeof decodeIco>,
  x: number,
  y: number,
): Pixel {
  if (image.kind !== 'rgba') throw new Error('Not a bitmap');
  const at = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(at, at + 4)) as Pixel;
}

const png = (size: number) =>
  sharp({
    create: { width: size, height: size, channels: 4, background: '#00ff00' },
  })
    .png()
    .toBuffer();

describe('icon files', () => {
  it('knows an icon by its header', async () => {
    expect(
      isIco(
        icoFile([{ size: 16, bitCount: 32, data: bitmap24(16, [0, 0, 0, 0]) }]),
      ),
    ).toBe(true);
    expect(isIco(await png(16))).toBe(false);
    expect(isIco(Buffer.from([0, 0, 1, 0, 0, 0]))).toBe(false);
  });

  it('reads a 32-bit bitmap by its own alpha, top row first', () => {
    const image = decodeIco(
      icoFile([
        {
          size: 4,
          bitCount: 32,
          data: bitmap32(4, (x, y) =>
            x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 255, 0],
          ),
        },
      ]),
      48,
    );
    expect(image).toMatchObject({ kind: 'rgba', width: 4, height: 4 });
    expect(pixelAt(image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(image, 0, 3)).toEqual([0, 0, 255, 0]);
  });

  it('reads a paletted bitmap through its mask', () => {
    const size = 4;
    const stride = 4;
    const rows = Buffer.alloc(stride * size);
    // The top row is the second colour, the rest the first.
    rows.fill(1, (size - 1) * stride, (size - 1) * stride + size);
    const image = decodeIco(
      icoFile([
        {
          size,
          bitCount: 8,
          data: Buffer.concat([
            bitmapHeader(size, 8, 2),
            Buffer.from([0, 0, 255, 0, 255, 0, 0, 0]),
            rows,
            mask(size, (x) => x === 0),
          ]),
        },
      ]),
      48,
    );
    expect(pixelAt(image, 0, 0)[3]).toBe(0);
    expect(pixelAt(image, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(image, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('takes the smallest image at least the size of the tile, else the largest', async () => {
    const small = icoFile([
      { size: 16, bitCount: 24, data: bitmap24(16, [255, 0, 0, 255]) },
      { size: 32, bitCount: 24, data: bitmap24(32, [0, 0, 255, 255]) },
    ]);
    expect(decodeIco(small, 48)).toMatchObject({ width: 32 });

    const large = icoFile([
      { size: 16, bitCount: 24, data: bitmap24(16, [255, 0, 0, 255]) },
      { size: 256, bitCount: 32, data: await png(256) },
      { size: 64, bitCount: 32, data: await png(64) },
    ]);
    const chosen = decodeIco(large, 48);
    expect(chosen.kind).toBe('png');
    expect(
      await sharp(chosen.data)
        .metadata()
        .then((meta) => meta.width),
    ).toBe(64);
  });

  it('turns into the stored tile like any other icon', async () => {
    const converted = await convertExternalLinkFavicon(
      icoFile([
        {
          size: 16,
          bitCount: 32,
          data: bitmap32(16, () => [0, 128, 255, 255]),
        },
      ]),
    );
    expect(await sharp(converted).metadata()).toMatchObject({
      format: 'webp',
      width: EXTERNAL_LINK_FAVICON_SIZE,
      height: EXTERNAL_LINK_FAVICON_SIZE,
    });
  });

  it('refuses an icon with no image it can read', async () => {
    const broken = icoFile([
      { size: 16, bitCount: 32, data: Buffer.from('not a bitmap at all') },
    ]);
    expect(() => decodeIco(broken, 48)).toThrow();
    await expect(convertExternalLinkFavicon(broken)).rejects.toThrow();
  });
});
