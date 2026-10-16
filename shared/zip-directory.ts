import { concatBytes } from './bytes';
import { decodeCp437, guessLegacyEncoding } from './text-bytes';

/**
 * The list of a ZIP archive's files, read from its central directory at the
 * end of the archive: a few small reads, however large the archive is. A
 * file inside is unpacked elsewhere, by whoever shows it.
 */

/** Bytes of a file read a piece at a time: by address, or from a file at hand. */
export interface ByteSource {
  readonly size: number;
  /** The bytes from `start` up to, not including, `end`. */
  read(
    start: number,
    end: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer>>;
}

export interface ZipEntry {
  /** The path inside the archive, folders apart by `/`. */
  name: string;
  directory: boolean;
  /** Unpacked. */
  size: number;
  packedSize: number;
  /** 0 stored as is, 8 deflated; anything else this reader does not unpack. */
  method: number;
  encrypted: boolean;
  /** Where the file's local header starts. */
  offset: number;
}

export interface ZipDirectory {
  entries: ZipEntry[];
  /** How many files the archive says it holds; more than listed when cut short. */
  count: number;
}

export class ZipReadError extends Error {
  constructor(readonly reason: 'not-zip' | 'too-large' | 'unsupported') {
    super(`ZIP: ${reason}`);
  }
}

const END = 0x06054b50;
const END64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const CENTRAL = 0x02014b50;
export const ZIP_LOCAL_HEADER = 0x04034b50;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function utf8Name(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * The archive's files, in the order it keeps them. Names that are no UTF-8
 * are read in the one older encoding all of them together look like; a
 * directory larger than `maxDirectoryBytes` is listed as far as it was read.
 */
export async function readZipDirectory(
  source: ByteSource,
  { maxDirectoryBytes = 16 * 1024 * 1024 }: { maxDirectoryBytes?: number } = {},
): Promise<ZipDirectory> {
  // The end record is the last thing in the archive, before a comment of up
  // to 64 KB; a ZIP64 locator stands just before it.
  const tailSize = Math.min(source.size, 22 + MAX16 + 20);
  const tail = await source.read(source.size - tailSize, source.size);
  const tailView = view(tail);
  let end = -1;
  for (let at = tail.length - 22; at >= 0; at--) {
    if (tailView.getUint32(at, true) === END) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new ZipReadError('not-zip');

  let count = tailView.getUint16(end + 10, true);
  let directorySize = tailView.getUint32(end + 12, true);
  let directoryOffset = tailView.getUint32(end + 16, true);
  if (
    (count === MAX16 || directorySize === MAX32 || directoryOffset === MAX32) &&
    end >= 20 &&
    tailView.getUint32(end - 20, true) === LOCATOR64
  ) {
    const recordOffset = Number(tailView.getBigUint64(end - 12, true));
    const record = view(await source.read(recordOffset, recordOffset + 56));
    if (record.getUint32(0, true) !== END64) throw new ZipReadError('not-zip');
    count = Number(record.getBigUint64(32, true));
    directorySize = Number(record.getBigUint64(40, true));
    directoryOffset = Number(record.getBigUint64(48, true));
  }
  if (directoryOffset + directorySize > source.size)
    throw new ZipReadError('not-zip');

  const directory = await source.read(
    directoryOffset,
    directoryOffset + Math.min(directorySize, maxDirectoryBytes),
  );
  const at = view(directory);
  const entries: ZipEntry[] = [];
  /** Names in an older encoding, read once all of them are known. */
  const legacy: { entry: ZipEntry; bytes: Uint8Array }[] = [];
  let p = 0;
  while (p + 46 <= directory.length && entries.length < count) {
    if (at.getUint32(p, true) !== CENTRAL) break;
    const flags = at.getUint16(p + 8, true);
    const method = at.getUint16(p + 10, true);
    let packedSize = at.getUint32(p + 20, true);
    let size = at.getUint32(p + 24, true);
    const nameLength = at.getUint16(p + 28, true);
    const extraLength = at.getUint16(p + 30, true);
    const commentLength = at.getUint16(p + 32, true);
    let offset = at.getUint32(p + 42, true);
    const nameStart = p + 46;
    const extraStart = nameStart + nameLength;
    const next = extraStart + extraLength + commentLength;
    if (next > directory.length) break;

    const nameBytes = directory.subarray(nameStart, extraStart);
    let name =
      (flags & 0x800) !== 0
        ? new TextDecoder().decode(nameBytes)
        : utf8Name(nameBytes);
    const extraEnd = extraStart + extraLength;
    for (let e = extraStart; e + 4 <= extraEnd;) {
      const id = at.getUint16(e, true);
      const length = at.getUint16(e + 2, true);
      const data = e + 4;
      // A field longer than the room left for it: the rest is not to be read.
      if (data + length > extraEnd) break;
      if (id === 0x0001) {
        // ZIP64: the 64-bit values of the fields that were too small, in order.
        let q = data;
        const take = () => {
          const value = Number(at.getBigUint64(q, true));
          q += 8;
          return value;
        };
        if (size === MAX32 && q + 8 <= data + length) size = take();
        if (packedSize === MAX32 && q + 8 <= data + length) packedSize = take();
        if (offset === MAX32 && q + 8 <= data + length) offset = take();
      } else if (id === 0x7075 && length > 5) {
        // The name in UTF-8, beside one written in an older encoding.
        name = new TextDecoder().decode(
          directory.subarray(data + 5, data + length),
        );
      }
      e = data + length;
    }
    const entry: ZipEntry = {
      name: name ?? '',
      directory: false,
      size,
      packedSize,
      method,
      encrypted: (flags & 1) !== 0,
      offset,
    };
    if (name === undefined) legacy.push({ entry, bytes: nameBytes });
    entries.push(entry);
    p = next;
  }
  if (legacy.length) {
    // A Russian Windows writes names in code page 866, a Western one in 437.
    const all = concatBytes(legacy.map(({ bytes }) => bytes));
    const decode =
      guessLegacyEncoding(all, 'ibm866') === 'ibm866'
        ? (bytes: Uint8Array) => new TextDecoder('ibm866').decode(bytes)
        : decodeCp437;
    for (const { entry, bytes } of legacy) entry.name = decode(bytes);
  }
  for (const entry of entries) {
    // Some archivers on Windows part folders with a backslash.
    entry.name = entry.name.replaceAll('\\', '/');
    entry.directory = entry.name.endsWith('/');
  }
  return { entries, count };
}

/** Where a file's packed bytes start, past its local header. */
export async function zipEntryDataStart(
  source: ByteSource,
  entry: ZipEntry,
): Promise<number> {
  const header = view(await source.read(entry.offset, entry.offset + 30));
  if (header.byteLength < 30 || header.getUint32(0, true) !== ZIP_LOCAL_HEADER)
    throw new ZipReadError('not-zip');
  return (
    entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
  );
}

/** Whether a file of the archive can be unpacked to show it. */
export function isZipEntryReadable(entry: ZipEntry, maxBytes: number): boolean {
  return (
    !entry.directory &&
    !entry.encrypted &&
    (entry.method === 0 || entry.method === 8) &&
    entry.size <= maxBytes
  );
}

/** A folder of an archive, with what is in it. The root is named `''`. */
export interface ZipFolder {
  name: string;
  /** From the root, folders apart by `/`; `''` for the root. */
  path: string;
  parent?: ZipFolder;
  /** Folders first, then files, each in the order `compare` gives names. */
  folders: ZipFolder[];
  files: ZipEntry[];
  /** The files inside at any depth, and what they weigh unpacked. */
  count: number;
  size: number;
}

/** The last part of a path inside an archive: a file's or folder's own name. */
export function zipEntryBaseName(name: string): string {
  return name.split('/').filter(Boolean).at(-1) ?? name;
}

/**
 * The archive as folders, built from the paths of its files: a folder needs
 * no entry of its own to be there.
 */
export function zipTree(
  entries: readonly ZipEntry[],
  compare: (a: string, b: string) => number,
): ZipFolder {
  const root: ZipFolder = {
    name: '',
    path: '',
    folders: [],
    files: [],
    count: 0,
    size: 0,
  };
  const byPath = new Map<string, ZipFolder>([['', root]]);
  const folderAt = (parts: string[]): ZipFolder => {
    let folder = root;
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let next = byPath.get(path);
      if (!next) {
        next = {
          name: parts[i]!,
          path,
          parent: folder,
          folders: [],
          files: [],
          count: 0,
          size: 0,
        };
        byPath.set(path, next);
        folder.folders.push(next);
      }
      folder = next;
    }
    return folder;
  };
  for (const entry of entries) {
    const parts = entry.name.split('/').filter(Boolean);
    if (!parts.length) continue;
    if (entry.directory) {
      folderAt(parts);
      continue;
    }
    folderAt(parts.slice(0, -1)).files.push(entry);
    for (
      let folder: ZipFolder | undefined = folderAt(parts.slice(0, -1));
      folder;
      folder = folder.parent
    ) {
      folder.count++;
      folder.size += entry.size;
    }
  }
  for (const folder of byPath.values()) {
    folder.folders.sort((a, b) => compare(a.name, b.name));
    folder.files.sort((a, b) =>
      compare(zipEntryBaseName(a.name), zipEntryBaseName(b.name)),
    );
  }
  return root;
}
