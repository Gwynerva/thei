import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, rm, type FileHandle } from 'node:fs/promises';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { createError } from 'h3';
import { AssetType } from '../../../shared/asset';
import { theiTempPath } from './temp';

/**
 * Removes embedded metadata from a file stored as uploaded, without re-encoding.
 *
 * Camera and editor metadata travels inside the bytes: GPS coordinates, device
 * serial numbers, capture times, author names, embedded thumbnails. A
 * transformed upload loses all of it in the encoder; an original has to be
 * cleaned structurally so that the pixels and samples stay exactly as they
 * were.
 *
 * Both sides stream: the source is read by offset and the result is written as
 * it is decided, so a large file never enters memory. Returns the path of a new
 * file in `.thei/tmp`, or `undefined` when there was nothing to remove or the
 * format is not one this can clean (documents, AVIF, SVG).
 */
export async function stripAssetMetadata(
  sourcePath: string,
  extension: string,
  type: AssetType,
): Promise<string | undefined> {
  const normalized = extension.toLowerCase();
  if (type === AssetType.Video || type === AssetType.Audio) {
    return await remuxWithoutMetadata(sourcePath, normalized, type);
  }
  const strip =
    normalized === 'jpg' || normalized === 'jpeg'
      ? planJpeg
      : normalized === 'png'
        ? planPng
        : normalized === 'webp'
          ? planWebp
          : normalized === 'gif'
            ? planGif
            : undefined;
  if (!strip) return undefined;

  const source = await open(sourcePath, 'r');
  try {
    const reader = new PositionalReader(source, (await source.stat()).size);
    const plan = await strip(reader);
    if (!plan) return undefined;
    const outputPath = theiTempPath(`thei-clean-${randomUUID()}.${normalized}`);
    await writePlan(reader, plan, outputPath);
    return outputPath;
  } catch (error) {
    if (error instanceof MalformedFileError) {
      throw createError({ statusCode: 400, message: 'Invalid image file' });
    }
    throw error;
  } finally {
    await source.close();
  }
}

/** A cleaned file: pieces of the source and new bytes, in order. */
type Plan = ({ from: number; to: number } | { bytes: Buffer })[];

class MalformedFileError extends Error {}

const WINDOW_SIZE = 64 * 1024;

class PositionalReader {
  private window = Buffer.alloc(0);
  private windowStart = 0;

  constructor(
    readonly handle: FileHandle,
    readonly size: number,
  ) {}

  /** Reads exactly `length` bytes at `position`, or fails on a short file. */
  async bytes(position: number, length: number): Promise<Buffer> {
    if (position < 0 || position + length > this.size)
      throw new MalformedFileError();
    if (
      position >= this.windowStart &&
      position + length <= this.windowStart + this.window.length
    ) {
      const offset = position - this.windowStart;
      return this.window.subarray(offset, offset + length);
    }
    if (length > WINDOW_SIZE) {
      const buffer = Buffer.alloc(length);
      await this.handle.read(buffer, 0, length, position);
      return buffer;
    }
    const windowLength = Math.min(WINDOW_SIZE, this.size - position);
    const buffer = Buffer.alloc(windowLength);
    await this.handle.read(buffer, 0, windowLength, position);
    this.window = buffer;
    this.windowStart = position;
    return buffer.subarray(0, length);
  }

  async byte(position: number): Promise<number> {
    return (await this.bytes(position, 1))[0]!;
  }

  /** Current read window starting at `position`, for fast byte scans. */
  async chunk(position: number): Promise<Buffer> {
    const length = Math.min(WINDOW_SIZE, this.size - position);
    return await this.bytes(position, length);
  }
}

async function writePlan(
  reader: PositionalReader,
  plan: Plan,
  outputPath: string,
) {
  const output = await open(outputPath, 'w');
  try {
    const buffer = Buffer.alloc(WINDOW_SIZE);
    for (const piece of plan) {
      if ('bytes' in piece) {
        await output.write(piece.bytes);
        continue;
      }
      for (let position = piece.from; position < piece.to;) {
        const length = Math.min(WINDOW_SIZE, piece.to - position);
        const { bytesRead } = await reader.handle.read(
          buffer,
          0,
          length,
          position,
        );
        if (!bytesRead) throw new MalformedFileError();
        await output.write(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
    }
  } catch (error) {
    await output.close().catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
  await output.close();
}

/** Merges adjacent source ranges and reports whether anything was dropped. */
function finishPlan(plan: Plan, size: number): Plan | undefined {
  const merged: Plan = [];
  for (const piece of plan) {
    const last = merged.at(-1);
    if (last && 'to' in last && 'from' in piece && last.to === piece.from) {
      last.to = piece.to;
    } else {
      merged.push({ ...piece });
    }
  }
  const only = merged[0];
  const unchanged =
    merged.length === 1 && only && 'from' in only && only.from === 0
      ? only.to === size
      : false;
  return unchanged ? undefined : merged;
}

// JPEG ----------------------------------------------------------------------

const JPEG_APP0 = 0xe0;
const JPEG_APP1 = 0xe1;
const JPEG_APP2 = 0xe2;
const JPEG_APP14 = 0xee;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/**
 * Keeps what decoding needs (tables, frame, JFIF, ICC profile, Adobe color
 * transform) and drops every other APPn and comment: EXIF, XMP, IPTC, maker
 * notes, MPF and whatever is appended after the image, such as motion-photo
 * videos. EXIF orientation is the one tag that changes how the image looks,
 * so it survives in a minimal EXIF block of its own.
 */
async function planJpeg(reader: PositionalReader): Promise<Plan | undefined> {
  const start = await reader.bytes(0, 2);
  if (start[0] !== 0xff || start[1] !== 0xd8) throw new MalformedFileError();

  const kept: Plan = [];
  let orientation: number | undefined;
  let position = 2;
  while (true) {
    const marker = await nextJpegMarker(reader, position);
    const segmentStart = marker.position - 1;
    const length = (await reader.bytes(marker.position + 1, 2)).readUInt16BE(0);
    const segmentEnd = marker.position + 1 + length;
    if (length < 2 || segmentEnd > reader.size) throw new MalformedFileError();

    if (marker.code === JPEG_SOS) {
      const end = await findJpegEnd(reader, segmentEnd);
      kept.push({ from: segmentStart, to: end });
      break;
    }
    if (marker.code === JPEG_APP1 && orientation === undefined) {
      orientation = readExifOrientation(
        await reader.bytes(marker.position + 3, length - 2),
      );
    }
    if (await keepJpegSegment(reader, marker.code, marker.position, length)) {
      kept.push({ from: segmentStart, to: segmentEnd });
    }
    position = segmentEnd;
  }

  const plan: Plan = [{ from: 0, to: 2 }];
  // JFIF must stay first; the orientation block follows it.
  const first = kept[0];
  let rest = kept;
  if (first && 'from' in first) {
    const code = await reader.byte(first.from + 1);
    if (code === JPEG_APP0) {
      plan.push(first);
      rest = kept.slice(1);
    }
  }
  if (orientation && orientation !== 1) {
    plan.push({ bytes: orientationExifSegment(orientation) });
  }
  plan.push(...rest);
  return finishPlan(plan, reader.size);
}

async function nextJpegMarker(reader: PositionalReader, position: number) {
  if ((await reader.byte(position)) !== 0xff) throw new MalformedFileError();
  let cursor = position + 1;
  // Any number of 0xFF fill bytes may precede a marker code.
  while ((await reader.byte(cursor)) === 0xff) cursor++;
  return { code: await reader.byte(cursor), position: cursor };
}

async function keepJpegSegment(
  reader: PositionalReader,
  code: number,
  markerPosition: number,
  length: number,
) {
  if (code === 0xfe) return false;
  if (code < JPEG_APP0 || code > 0xef) return true;
  if (code === JPEG_APP0 || code === JPEG_APP14) return true;
  if (code !== JPEG_APP2 || length < 14) return false;
  const signature = await reader.bytes(markerPosition + 3, 12);
  return signature.toString('latin1') === 'ICC_PROFILE\0';
}

/**
 * Finds the end of the image: the EOI that follows the scans.
 *
 * Entropy-coded data escapes 0xFF as 0xFF00 and restart markers carry no
 * length, so the first real EOI is the end of this image even when another
 * JPEG, such as an MPF thumbnail, is appended after it.
 */
async function findJpegEnd(reader: PositionalReader, position: number) {
  // A damaged tail is not a reason to refuse the image: keep everything.
  return await scanJpegEnd(reader, position).catch((error) => {
    if (error instanceof MalformedFileError) return reader.size;
    throw error;
  });
}

async function scanJpegEnd(reader: PositionalReader, position: number) {
  let cursor = position;
  while (cursor < reader.size - 1) {
    const chunk = await reader.chunk(cursor);
    const index = chunk.indexOf(0xff);
    if (index === -1) {
      cursor += chunk.length;
      continue;
    }
    cursor += index;
    if (cursor + 1 >= reader.size) break;
    const code = await reader.byte(cursor + 1);
    if (code === JPEG_EOI) return cursor + 2;
    if (code === 0x00 || code === 0xff || (code >= 0xd0 && code <= 0xd7)) {
      cursor += 1;
      continue;
    }
    // A marker segment between progressive scans: DHT, SOS, DRI and the like.
    const length = (await reader.bytes(cursor + 2, 2)).readUInt16BE(0);
    cursor += 2 + length;
  }
  return reader.size;
}

function readExifOrientation(segment: Buffer): number | undefined {
  if (segment.length < 14 || segment.toString('latin1', 0, 6) !== 'Exif\0\0')
    return undefined;
  const tiff = segment.subarray(6);
  const littleEndian = tiff.toString('latin1', 0, 2) === 'II';
  const u16 = (offset: number) =>
    littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = (offset: number) =>
    littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return undefined;
  const count = u16(ifd);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > tiff.length) return undefined;
    if (u16(entry) !== 0x0112) continue;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : undefined;
  }
  return undefined;
}

/** An APP1 segment whose EXIF holds nothing but the orientation tag. */
function orientationExifSegment(orientation: number): Buffer {
  const segment = Buffer.alloc(36);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(34, 2);
  segment.write('Exif\0\0', 4, 'latin1');
  segment.write('MM', 10, 'latin1');
  segment.writeUInt16BE(42, 12);
  segment.writeUInt32BE(8, 14);
  segment.writeUInt16BE(1, 18);
  segment.writeUInt16BE(0x0112, 20);
  segment.writeUInt16BE(3, 22);
  segment.writeUInt32BE(1, 24);
  segment.writeUInt16BE(orientation, 28);
  segment.writeUInt32BE(0, 32);
  return segment;
}

// PNG -----------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

async function planPng(reader: PositionalReader): Promise<Plan | undefined> {
  if (!(await reader.bytes(0, 8)).equals(PNG_SIGNATURE))
    throw new MalformedFileError();
  const plan: Plan = [{ from: 0, to: 8 }];
  let position = 8;
  while (true) {
    const header = await reader.bytes(position, 8);
    const length = header.readUInt32BE(0);
    const type = header.toString('latin1', 4, 8);
    const end = position + 12 + length;
    if (end > reader.size) throw new MalformedFileError();
    if (!PNG_METADATA_CHUNKS.has(type)) plan.push({ from: position, to: end });
    position = end;
    if (type === 'IEND') break;
  }
  return finishPlan(plan, reader.size);
}

// WebP ----------------------------------------------------------------------

const WEBP_VP8X_EXIF = 0x08;
const WEBP_VP8X_XMP = 0x04;

async function planWebp(reader: PositionalReader): Promise<Plan | undefined> {
  const header = await reader.bytes(0, 12);
  if (
    header.toString('latin1', 0, 4) !== 'RIFF' ||
    header.toString('latin1', 8, 12) !== 'WEBP'
  )
    throw new MalformedFileError();
  const riffEnd = Math.min(reader.size, 8 + header.readUInt32LE(4));

  const chunks: Plan = [];
  let payloadSize = 4;
  let dropped = false;
  let position = 12;
  while (position + 8 <= riffEnd) {
    const chunkHeader = await reader.bytes(position, 8);
    const fourcc = chunkHeader.toString('latin1', 0, 4);
    const size = chunkHeader.readUInt32LE(4);
    const end = position + 8 + size + (size % 2);
    if (position + 8 + size > reader.size) throw new MalformedFileError();
    const chunkEnd = Math.min(end, reader.size);
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      dropped = true;
    } else if (fourcc === 'VP8X' && size >= 10) {
      const chunk = Buffer.from(
        await reader.bytes(position, chunkEnd - position),
      );
      chunk[8] = chunk[8]! & ~(WEBP_VP8X_EXIF | WEBP_VP8X_XMP);
      chunks.push({ bytes: chunk });
      payloadSize += chunk.length;
    } else {
      chunks.push({ from: position, to: chunkEnd });
      payloadSize += chunkEnd - position;
    }
    position = end;
  }
  if (!dropped && riffEnd === reader.size) return undefined;

  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(payloadSize, 4);
  riff.write('WEBP', 8, 'latin1');
  return [{ bytes: riff }, ...chunks];
}

// GIF -----------------------------------------------------------------------

const GIF_KEPT_APPLICATIONS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

/**
 * Keeps image data, graphic control and looping; drops comments, XMP and any
 * other application data, and anything after the trailer.
 */
async function planGif(reader: PositionalReader): Promise<Plan | undefined> {
  const header = await reader.bytes(0, 13);
  if (header.toString('latin1', 0, 3) !== 'GIF') throw new MalformedFileError();
  let position = 13 + colorTableSize(header[10]!);
  const plan: Plan = [{ from: 0, to: position }];
  while (true) {
    const introducer = await reader.byte(position);
    if (introducer === 0x3b) {
      plan.push({ from: position, to: position + 1 });
      break;
    }
    if (introducer === 0x2c) {
      const descriptor = await reader.bytes(position, 10);
      const dataStart = position + 10 + colorTableSize(descriptor[9]!) + 1;
      const end = await skipSubBlocks(reader, dataStart);
      plan.push({ from: position, to: end });
      position = end;
      continue;
    }
    if (introducer !== 0x21) throw new MalformedFileError();
    const label = await reader.byte(position + 1);
    const end = await skipSubBlocks(reader, position + 2);
    let keep = label !== 0xfe && label !== 0xff;
    if (label === 0xff) {
      const size = await reader.byte(position + 2);
      const identifier =
        size >= 11
          ? (await reader.bytes(position + 3, 11)).toString('latin1')
          : '';
      keep = GIF_KEPT_APPLICATIONS.has(identifier);
    }
    if (keep) plan.push({ from: position, to: end });
    position = end;
  }
  return finishPlan(plan, reader.size);
}

function colorTableSize(flags: number) {
  return flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0;
}

async function skipSubBlocks(reader: PositionalReader, position: number) {
  let cursor = position;
  while (true) {
    const size = await reader.byte(cursor);
    cursor += 1 + size;
    if (size === 0) return cursor;
  }
}

// Video and audio -----------------------------------------------------------

/**
 * Copies the streams into a fresh container without metadata or chapters.
 *
 * Only real video and audio streams are kept: attached cover pictures and data
 * streams, such as the GPS telemetry some cameras record, are left behind.
 * `bitexact` stops the muxer from stamping its own version and creation time.
 */
async function remuxWithoutMetadata(
  sourcePath: string,
  extension: string,
  type: AssetType,
): Promise<string> {
  const outputPath = theiTempPath(`thei-clean-${randomUUID()}.${extension}`);
  const args = [
    '-y',
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    sourcePath,
    ...(type === AssetType.Video ? ['-map', '0:V?'] : []),
    '-map',
    '0:a?',
    '-c',
    'copy',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    outputPath,
  ];
  const succeeded = await new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegInstaller.path, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
  if (!succeeded) {
    await rm(outputPath, { force: true }).catch(() => {});
    throw createError({
      statusCode: 400,
      message:
        type === AssetType.Video ? 'Invalid video file' : 'Invalid audio file',
    });
  }
  return outputPath;
}
