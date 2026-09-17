/**
 * Tells whether a local video file has an audio track before it is uploaded.
 *
 * Reads only container headers through `Blob.slice`: the track list of MP4/MOV
 * (`moov` → `trak` → `mdia` → `hdlr`), WebM/Matroska (`Tracks` → `TrackType`)
 * and AVI (`strh` stream types). `undefined` means the answer is unknown; the
 * server inspects the file with ffmpeg either way.
 */

const MAX_MOOV_BYTES = 32 * 1024 * 1024;
const EBML_HEAD_BYTES = 4 * 1024 * 1024;
const AVI_HEAD_BYTES = 1024 * 1024;

type BlobLike = Pick<Blob, 'size' | 'slice'>;

async function readBytes(
  blob: BlobLike,
  start: number,
  end: number,
): Promise<Uint8Array> {
  return new Uint8Array(
    await blob.slice(start, Math.min(end, blob.size)).arrayBuffer(),
  );
}

function fourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

// ISO base media (mp4, mov) -------------------------------------------------

async function findTopLevelBox(
  blob: BlobLike,
  type: string,
): Promise<{ start: number; size: number } | undefined> {
  let offset = 0;
  while (offset + 8 <= blob.size) {
    const header = await readBytes(blob, offset, offset + 16);
    if (header.length < 8) return undefined;
    const view = new DataView(header.buffer, header.byteOffset);
    let size = view.getUint32(0);
    let headerSize = 8;
    if (size === 1) {
      if (header.length < 16) return undefined;
      size = Number(view.getBigUint64(8));
      headerSize = 16;
    } else if (size === 0) {
      size = blob.size - offset;
    }
    if (size < headerSize) return undefined;
    if (fourCc(header, 4) === type) return { start: offset, size };
    offset += size;
  }
  return undefined;
}

function isoTrackHandlers(bytes: Uint8Array, start: number, end: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const handlers: string[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(view.getBigUint64(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    const type = fourCc(bytes, offset + 4);
    if (type === 'trak' || type === 'mdia') {
      handlers.push(
        ...isoTrackHandlers(bytes, offset + headerSize, offset + size),
      );
    } else if (type === 'hdlr' && offset + headerSize + 12 <= end) {
      // version/flags (4) + pre_defined (4) precede the handler type.
      handlers.push(fourCc(bytes, offset + headerSize + 8));
    }
    offset += size;
  }
  return handlers;
}

export async function detectIsoMediaAudio(
  blob: BlobLike,
): Promise<boolean | undefined> {
  const moov = await findTopLevelBox(blob, 'moov');
  if (!moov || moov.size > MAX_MOOV_BYTES) return undefined;
  const bytes = await readBytes(blob, moov.start, moov.start + moov.size);
  if (bytes.length < moov.size) return undefined;
  const handlers = isoTrackHandlers(bytes, 8, bytes.length);
  if (!handlers.includes('vide')) return undefined;
  return handlers.includes('soun');
}

// Matroska / WebM -----------------------------------------------------------

const EBML_SEGMENT = 0x18538067;
const EBML_TRACKS = 0x1654ae6b;
const EBML_CLUSTER = 0x1f43b675;
const EBML_TRACK_ENTRY = 0xae;
const EBML_TRACK_TYPE = 0x83;

function readVint(
  bytes: Uint8Array,
  offset: number,
  keepMarker: boolean,
): { value: number; length: number; unknown: boolean } | undefined {
  const first = bytes[offset];
  if (first === undefined || first === 0) return undefined;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || offset + length > bytes.length) return undefined;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let index = 1; index < length; index++) {
    const byte = bytes[offset + index]!;
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readEbmlElement(bytes: Uint8Array, offset: number) {
  const id = readVint(bytes, offset, true);
  if (!id) return undefined;
  const size = readVint(bytes, offset + id.length, false);
  if (!size) return undefined;
  const dataStart = offset + id.length + size.length;
  return {
    id: id.value,
    dataStart,
    dataEnd: size.unknown ? bytes.length : dataStart + size.value,
    unknownSize: size.unknown,
  };
}

function matroskaTrackTypes(bytes: Uint8Array, start: number, end: number) {
  const types: number[] = [];
  let offset = start;
  while (offset < end) {
    const element = readEbmlElement(bytes, offset);
    if (!element || element.dataEnd > end) break;
    if (element.id === EBML_TRACK_ENTRY) {
      let inner = element.dataStart;
      while (inner < element.dataEnd) {
        const child = readEbmlElement(bytes, inner);
        if (!child || child.dataEnd > element.dataEnd) break;
        if (child.id === EBML_TRACK_TYPE) {
          let value = 0;
          for (let index = child.dataStart; index < child.dataEnd; index++) {
            value = value * 256 + bytes[index]!;
          }
          types.push(value);
        }
        inner = child.dataEnd;
      }
    }
    offset = element.dataEnd;
  }
  return types;
}

export async function detectMatroskaAudio(
  blob: BlobLike,
): Promise<boolean | undefined> {
  const bytes = await readBytes(blob, 0, EBML_HEAD_BYTES);
  const header = readEbmlElement(bytes, 0);
  if (!header || header.unknownSize) return undefined;
  const segment = readEbmlElement(bytes, header.dataEnd);
  if (!segment || segment.id !== EBML_SEGMENT) return undefined;

  let offset = segment.dataStart;
  while (offset < bytes.length) {
    const element = readEbmlElement(bytes, offset);
    if (!element || element.id === EBML_CLUSTER || element.unknownSize) {
      return undefined;
    }
    if (element.id === EBML_TRACKS) {
      if (element.dataEnd > bytes.length) return undefined;
      const types = matroskaTrackTypes(
        bytes,
        element.dataStart,
        element.dataEnd,
      );
      if (!types.includes(1)) return undefined;
      return types.includes(2);
    }
    offset = element.dataEnd;
  }
  return undefined;
}

// AVI -----------------------------------------------------------------------

export async function detectAviAudio(
  blob: BlobLike,
): Promise<boolean | undefined> {
  const bytes = await readBytes(blob, 0, AVI_HEAD_BYTES);
  if (fourCc(bytes, 0) !== 'RIFF' || fourCc(bytes, 8) !== 'AVI ') {
    return undefined;
  }
  const streamTypes: string[] = [];
  for (let offset = 12; offset + 12 <= bytes.length; offset++) {
    if (
      bytes[offset] === 0x73 &&
      fourCc(bytes, offset) === 'strh' &&
      offset + 12 <= bytes.length
    ) {
      streamTypes.push(fourCc(bytes, offset + 8));
    }
    if (fourCc(bytes, offset) === 'movi') break;
  }
  if (!streamTypes.includes('vids')) return undefined;
  return streamTypes.includes('auds');
}

export async function detectVideoAudio(
  blob: BlobLike,
  extension: string,
): Promise<boolean | undefined> {
  try {
    switch (extension.toLowerCase()) {
      case 'mp4':
      case 'mov':
        return await detectIsoMediaAudio(blob);
      case 'webm':
        return await detectMatroskaAudio(blob);
      case 'avi':
        return await detectAviAudio(blob);
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
