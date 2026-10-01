/**
 * Windows icons, the format of `/favicon.ico` on most sites, which sharp
 * cannot open. An icon file is a directory of images of several sizes, each
 * either a PNG or a bare BMP bitmap followed by a one-bit transparency mask.
 *
 * Read here rather than through a package: the format has not changed since
 * Windows Vista, and the decoders on npm are unmaintained.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const DIRECTORY_ENTRY_BYTES = 16;
const BITMAP_INFO_HEADER_BYTES = 40;

/** One image of an icon, ready for sharp. */
export type IcoImage =
  | { kind: 'png'; data: Buffer }
  | { kind: 'rgba'; data: Buffer; width: number; height: number };

interface IcoEntry {
  size: number;
  bitCount: number;
  offset: number;
  length: number;
}

export function isIco(source: Buffer) {
  return (
    source.length >= 6 &&
    source.readUInt16LE(0) === 0 &&
    source.readUInt16LE(2) === 1 &&
    source.readUInt16LE(4) > 0
  );
}

/**
 * The image of the icon that suits a tile of `size` best: the smallest one
 * at least that large, since drawing down keeps it sharp, or else the
 * largest. An image that cannot be read gives way to the next one.
 */
export function decodeIco(source: Buffer, size: number): IcoImage {
  const entries = readDirectory(source).sort(
    (left, right) =>
      fitScore(left.size, size) - fitScore(right.size, size) ||
      right.bitCount - left.bitCount,
  );
  for (const entry of entries) {
    const data = source.subarray(entry.offset, entry.offset + entry.length);
    if (data.subarray(0, 4).equals(PNG_SIGNATURE)) return { kind: 'png', data };
    const bitmap = decodeBitmap(data);
    if (bitmap) return { kind: 'rgba', ...bitmap };
  }
  throw new Error('No readable image in the icon');
}

function fitScore(entrySize: number, size: number) {
  return entrySize >= size ? entrySize - size : 1000 + size - entrySize;
}

function readDirectory(source: Buffer): IcoEntry[] {
  const count = source.readUInt16LE(4);
  const entries: IcoEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * DIRECTORY_ENTRY_BYTES;
    if (at + DIRECTORY_ENTRY_BYTES > source.length) break;
    // A width or height of 0 means 256.
    const width = source.readUInt8(at) || 256;
    const height = source.readUInt8(at + 1) || 256;
    const length = source.readUInt32LE(at + 8);
    const offset = source.readUInt32LE(at + 12);
    if (!length || offset + length > source.length) continue;
    entries.push({
      size: Math.min(width, height),
      bitCount: source.readUInt16LE(at + 6),
      offset,
      length,
    });
  }
  return entries;
}

/**
 * A BMP image as an icon stores it: a BITMAPINFOHEADER, a palette for up to
 * 8 bits per pixel, the colour rows bottom up, then the AND mask, whose set
 * bits are transparent. Its height counts both the colours and the mask.
 */
function decodeBitmap(
  data: Buffer,
): { data: Buffer; width: number; height: number } | undefined {
  if (data.length < BITMAP_INFO_HEADER_BYTES) return undefined;
  const headerSize = data.readUInt32LE(0);
  const width = data.readInt32LE(4);
  const height = Math.abs(data.readInt32LE(8)) / 2;
  const bitCount = data.readUInt16LE(14);
  const compression = data.readUInt32LE(16);
  const usedColors = data.readUInt32LE(32);
  if (
    headerSize < BITMAP_INFO_HEADER_BYTES ||
    compression !== 0 ||
    ![1, 4, 8, 24, 32].includes(bitCount) ||
    !Number.isInteger(height) ||
    width < 1 ||
    width > 256 ||
    height < 1 ||
    height > 256
  )
    return undefined;

  const paletteSize = bitCount <= 8 ? usedColors || 2 ** bitCount : 0;
  const paletteStart = headerSize;
  const pixelStart = paletteStart + paletteSize * 4;
  const colorStride = Math.ceil((width * bitCount) / 32) * 4;
  const maskStart = pixelStart + colorStride * height;
  const maskStride = Math.ceil(width / 32) * 4;
  if (maskStart > data.length) return undefined;
  const hasMask = maskStart + maskStride * height <= data.length;

  const rgba = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y += 1) {
    // Rows are stored bottom up.
    const row = pixelStart + (height - 1 - y) * colorStride;
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      let blue: number;
      let green: number;
      let red: number;
      let alpha = 255;
      if (bitCount >= 24) {
        const at = row + x * (bitCount / 8);
        blue = data[at]!;
        green = data[at + 1]!;
        red = data[at + 2]!;
        if (bitCount === 32) {
          alpha = data[at + 3]!;
          if (alpha) anyAlpha = true;
        }
      } else {
        const bit = x * bitCount;
        const byte = data[row + (bit >> 3)]!;
        const index =
          (byte >> (8 - bitCount - (bit & 7))) & ((1 << bitCount) - 1);
        if (index >= paletteSize) return undefined;
        const at = paletteStart + index * 4;
        blue = data[at]!;
        green = data[at + 1]!;
        red = data[at + 2]!;
      }
      rgba[target] = red;
      rgba[target + 1] = green;
      rgba[target + 2] = blue;
      rgba[target + 3] = alpha;
    }
  }

  // Colours with an alpha of their own need no mask. Otherwise the mask
  // says which pixels are transparent; an icon that has neither is opaque.
  if (!anyAlpha && hasMask) {
    for (let y = 0; y < height; y += 1) {
      const row = maskStart + (height - 1 - y) * maskStride;
      for (let x = 0; x < width; x += 1) {
        const transparent = (data[row + (x >> 3)]! >> (7 - (x & 7))) & 1;
        rgba[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  } else if (!anyAlpha) {
    for (let at = 3; at < rgba.length; at += 4) rgba[at] = 255;
  }
  return { data: rgba, width, height };
}
