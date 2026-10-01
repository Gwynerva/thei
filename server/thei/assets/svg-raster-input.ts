import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { theiTempPath } from './temp';

/**
 * An SVG prepared for librsvg, the renderer sharp draws SVG with.
 *
 * A `<use>` that sets no size of its own takes the size of what it shows:
 * the `width` and `height` of a `<symbol>` (SVG 2) or of a nested `<svg>`
 * (SVG 1.1 already). librsvg ignores both and draws such a `<use>` at 100% of
 * the viewport — the symbol's size it never read, the nested drawing's it
 * stopped reading in 2.56 (librsvg#1235) — where every browser draws it at
 * its own size. A pattern of a few icons repeated over a banner then comes
 * out as every icon blown up to the whole picture, hundreds of them on top
 * of each other. The copy gives each such `<use>` the size of what it shows,
 * which is the size the standard gives it anyway, so the drawing is the same
 * in any renderer.
 *
 * The stored file is never changed; only what sharp reads is. Anything else,
 * and an SVG that needs nothing, is handed over as it is. Once librsvg draws
 * these itself, a test in `svg-raster-input.test.ts` says so, and this goes.
 */
export interface RasterReadySvg {
  /** What to open with sharp: the input itself, or the prepared copy. */
  input: string | Buffer;
  /** Removes the copy, if one was written. */
  dispose: () => Promise<void>;
}

export interface SvgScanOptions {
  /** Bytes read at a time; tests make it tiny to split tags across reads. */
  chunkSize?: number;
}

interface TargetSize {
  width?: string;
  height?: string;
}

const NOTHING_TO_DISPOSE = async () => {};

export async function rasterReadySvg(
  input: string | Buffer,
  options: SvgScanOptions = {},
): Promise<RasterReadySvg> {
  if (Buffer.isBuffer(input))
    return { input: svgBufferForRaster(input), dispose: NOTHING_TO_DISPOSE };

  const targets = await sizesToCopy(input, options);
  if (!targets) return { input, dispose: NOTHING_TO_DISPOSE };
  const outputPath = theiTempPath(`thei-svg-raster-${randomUUID()}.svg`);
  const dispose = () => rm(outputPath, { force: true }).catch(() => {});
  try {
    await writeSized(input, outputPath, targets, options);
  } catch (error) {
    await dispose();
    throw error;
  }
  return { input: outputPath, dispose };
}

/** Runs `use` with the input prepared for librsvg, and cleans up after it. */
export async function withRasterReadySvg<T>(
  input: string | Buffer,
  use: (input: string | Buffer) => Promise<T>,
): Promise<T> {
  const prepared = await rasterReadySvg(input);
  try {
    return await use(prepared.input);
  } finally {
    await prepared.dispose();
  }
}

/**
 * The same for bytes already in memory, such as an icon fetched from another
 * site: the prepared copy, or the very buffer when it needs nothing.
 */
export function svgBufferForRaster(source: Buffer): Buffer {
  const text = source.toString('latin1');
  const collector = new UseCollector();
  collector.scanner.push(text);
  const targets = collector.end();
  if (!targets) return source;
  let output = '';
  const scanner = new TagScanner({
    raw: (piece) => (output += piece),
    tag: (name, tag) => (output += sizedTag(name, tag, targets)),
  });
  scanner.push(text);
  scanner.end();
  return Buffer.from(output, 'latin1');
}

/** Whether librsvg would draw this file differently from a browser. */
export async function svgNeedsUseSizes(
  path: string,
  options: SvgScanOptions = {},
): Promise<boolean> {
  return Boolean(await sizesToCopy(path, options));
}

/**
 * The sizes to copy onto `<use>` elements, by the id of what they show, or
 * nothing when no `<use>` lacks one its target declares — or the input is
 * not an SVG at all. A target may be defined after the elements that use
 * it, so the whole file is read before anything is decided; it is read as a
 * stream, never held whole.
 */
async function sizesToCopy(
  path: string,
  options: SvgScanOptions,
): Promise<Map<string, TargetSize> | undefined> {
  const collector = new UseCollector();
  for await (const chunk of readLatin1(path, options)) {
    collector.scanner.push(chunk);
    if (collector.scanner.notSvg) break;
  }
  return collector.end();
}

/**
 * Notes every sized `<symbol>` and nested `<svg>`, and every `<use>` that
 * lacks a size.
 */
class UseCollector {
  private readonly targets = new Map<string, TargetSize>();
  private readonly usedWithoutWidth = new Set<string>();
  private readonly usedWithoutHeight = new Set<string>();
  readonly scanner = new TagScanner({
    tag: (name, text) => {
      const attributes = parseAttributes(text);
      if (name !== 'use') {
        const id = attributes.get('id');
        const size = {
          width: definedSize(attributes.get('width')),
          height: definedSize(attributes.get('height')),
        };
        if (id && (size.width || size.height)) this.targets.set(id, size);
        return;
      }
      const id = referencedId(attributes);
      if (!id) return;
      if (!attributes.has('width')) this.usedWithoutWidth.add(id);
      if (!attributes.has('height')) this.usedWithoutHeight.add(id);
    },
  });

  /** The targets some `<use>` needs the size of, if any. */
  end(): Map<string, TargetSize> | undefined {
    if (!this.scanner.end()) return undefined;
    const needed = new Map<string, TargetSize>();
    for (const [id, size] of this.targets) {
      if (
        (size.width && this.usedWithoutWidth.has(id)) ||
        (size.height && this.usedWithoutHeight.has(id))
      )
        needed.set(id, size);
    }
    return needed.size ? needed : undefined;
  }
}

/**
 * Latin-1 keeps one character per byte, so the copy has exactly the bytes of
 * the source wherever it is not changed, whatever the file's encoding.
 */
function readLatin1(path: string, options: SvgScanOptions) {
  return createReadStream(path, {
    encoding: 'latin1',
    highWaterMark: options.chunkSize,
  }) as AsyncIterable<string>;
}

async function writeSized(
  sourcePath: string,
  outputPath: string,
  targets: Map<string, TargetSize>,
  options: SvgScanOptions,
) {
  const writer = createWriteStream(outputPath);
  const failed = once(writer, 'error').then(([error]) => {
    throw error;
  });
  failed.catch(() => {});
  let pending = '';
  const scanner = new TagScanner({
    raw: (text) => (pending += text),
    tag: (name, text) => (pending += sizedTag(name, text, targets)),
  });
  const flush = async () => {
    if (!pending) return;
    const text = pending;
    pending = '';
    if (!writer.write(text, 'latin1'))
      await Promise.race([once(writer, 'drain'), failed]);
  };
  for await (const chunk of readLatin1(sourcePath, options)) {
    scanner.push(chunk);
    await flush();
  }
  scanner.end();
  await flush();
  writer.end();
  await Promise.race([once(writer, 'finish'), failed]);
}

/** The tag with the sizes its target declares added, where it lacks them. */
function sizedTag(
  name: TagName,
  text: string,
  targets: Map<string, TargetSize>,
): string {
  if (name !== 'use') return text;
  const attributes = parseAttributes(text);
  const id = referencedId(attributes);
  const size = id ? targets.get(id) : undefined;
  if (!size) return text;
  let added = '';
  if (size.width && !attributes.has('width'))
    added += ` width=${quoted(size.width)}`;
  if (size.height && !attributes.has('height'))
    added += ` height=${quoted(size.height)}`;
  // Right after the element's name, where nothing can be in the way.
  const nameEnd = text.slice(1).search(/[\s/>]/) + 1;
  return nameEnd > 0
    ? text.slice(0, nameEnd) + added + text.slice(nameEnd)
    : text;
}

/** `auto` and an empty value mean the default, which librsvg already uses. */
function definedSize(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== 'auto' ? value : undefined;
}

/** A reference into the same document, `#id`; another file's is left alone. */
function referencedId(attributes: Map<string, string>) {
  const href = (attributes.get('href') ?? attributes.get('xlink:href'))?.trim();
  return href?.startsWith('#') ? href.slice(1) : undefined;
}

/** Values as written, entities and all: they are copied, never interpreted. */
function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(
    /\s([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  ))
    attributes.set(match[1]!, match[2] ?? match[3]!);
  return attributes;
}

function quoted(value: string) {
  return value.includes('"') ? `'${value}'` : `"${value}"`;
}

type TagName = 'use' | 'symbol' | 'svg';

interface ScanHandlers {
  /** Everything but the start tags below, verbatim and in order. */
  raw?: (text: string) => void;
  /**
   * A `<use>`, `<symbol>` or nested `<svg>` start tag, whole; `name`
   * without a prefix.
   */
  tag: (name: TagName, text: string) => void;
}

/** Constructs that run to a fixed terminator and are never looked inside. */
const OPAQUE = [
  ['<!--', '-->'],
  ['<![CDATA[', ']]>'],
  ['<?', '?>'],
] as const;

const ELEMENT_NAME = /[^\s/>]*/y;

/**
 * A streaming reader of XML markup, just enough to find start tags.
 *
 * Comments, CDATA sections, processing instructions and the doctype pass
 * through unread, so markup written inside them is never taken for an
 * element. Only `<use>`, `<symbol>` and nested `<svg>` start tags are held
 * until they end; everything else goes on as it arrives, so even a path many
 * megabytes long never accumulates. Before the root element XML allows only blank text,
 * which tells an SVG from a raster within the first bytes.
 */
class TagScanner {
  /** The input turned out not to be an SVG: nothing more is read. */
  notSvg = false;
  private rootSeen = false;
  private mode: 'text' | 'open' | 'opaque' | 'doctype' | 'skip' | 'collect' =
    'text';
  /** Read but not passed on yet: a `<` still undecided, or an opaque end. */
  private carry = '';
  private terminator = '';
  private quote = '';
  private depth = 0;
  private collected = '';
  private collecting: TagName = 'use';

  constructor(private readonly handlers: ScanHandlers) {}

  push(chunk: string) {
    if (this.notSvg) return;
    const text = this.carry + chunk;
    this.carry = '';
    let index = 0;
    while (index < text.length) {
      if (this.mode === 'text') {
        const open = text.indexOf('<', index);
        const end = open === -1 ? text.length : open;
        const piece = text.slice(index, end);
        // A byte-order mark is Latin-1 `ï»¿` here.
        if (!this.rootSeen && !/^[\s\u00ef\u00bb\u00bf]*$/.test(piece))
          return this.reject();
        this.raw(piece);
        if (open === -1) return;
        index = open;
        this.mode = 'open';
      } else if (this.mode === 'open') {
        const length = this.open(text, index);
        if (this.notSvg) return;
        if (length === undefined) {
          this.carry = text.slice(index);
          return;
        }
        index += length;
      } else if (this.mode === 'opaque') {
        const at = text.indexOf(this.terminator, index);
        if (at === -1) {
          // The terminator may straddle two chunks: keep its possible start.
          const keep = Math.max(
            index,
            text.length - (this.terminator.length - 1),
          );
          this.raw(text.slice(index, keep));
          this.carry = text.slice(keep);
          return;
        }
        const end = at + this.terminator.length;
        this.raw(text.slice(index, end));
        index = end;
        this.mode = 'text';
      } else {
        const end = this.tagEnd(text, index);
        const through = end === -1 ? text.length : end;
        if (this.mode === 'collect')
          this.collected += text.slice(index, through);
        else this.raw(text.slice(index, through));
        if (end === -1) return;
        if (this.mode === 'collect') {
          this.handlers.tag(this.collecting, this.collected);
          this.collected = '';
        }
        index = end;
        this.mode = 'text';
      }
    }
  }

  /** Passes on what is left; `true` when what was read is an SVG. */
  end(): boolean {
    if (this.notSvg) return false;
    // An unfinished tag at the end of the file is left as it was.
    this.raw(this.collected + this.carry);
    this.collected = '';
    this.carry = '';
    return this.rootSeen;
  }

  private raw(text: string) {
    if (text) this.handlers.raw?.(text);
  }

  private reject() {
    this.notSvg = true;
    this.carry = '';
    this.collected = '';
  }

  /**
   * Decides what the `<` at `index` opens and returns how much of it was
   * consumed, or nothing until enough of it has arrived.
   */
  private open(text: string, index: number): number | undefined {
    const rest = text.slice(index, index + '<![CDATA['.length);
    for (const [opener, terminator] of OPAQUE) {
      if (rest.startsWith(opener)) {
        this.mode = 'opaque';
        this.terminator = terminator;
        this.raw(opener);
        return opener.length;
      }
      if (opener.startsWith(rest)) return undefined;
    }
    if (rest.startsWith('<!') || rest.startsWith('</')) {
      this.mode = rest[1] === '!' ? 'doctype' : 'skip';
      this.depth = 0;
      this.quote = '';
      this.raw(rest.slice(0, 2));
      return 2;
    }

    ELEMENT_NAME.lastIndex = index + 1;
    const name = ELEMENT_NAME.exec(text)![0];
    // The name may go on in the next chunk.
    if (index + 1 + name.length === text.length) return undefined;
    const local = name.slice(name.lastIndexOf(':') + 1);
    const root = !this.rootSeen;
    if (root) {
      if (local !== 'svg') {
        this.reject();
        return undefined;
      }
      this.rootSeen = true;
    }
    this.depth = 0;
    this.quote = '';
    const opened = `<${name}`;
    if (local === 'use' || local === 'symbol' || (local === 'svg' && !root)) {
      this.mode = 'collect';
      this.collecting = local;
      this.collected = opened;
    } else {
      this.mode = 'skip';
      this.raw(opened);
    }
    return opened.length;
  }

  /** Index just past the `>` closing the current tag or doctype, or -1. */
  private tagEnd(text: string, from: number): number {
    for (let index = from; index < text.length; index++) {
      const char = text[index]!;
      if (this.quote) {
        if (char === this.quote) this.quote = '';
      } else if (char === '"' || char === "'") this.quote = char;
      else if (this.mode === 'doctype' && char === '[') this.depth++;
      else if (this.mode === 'doctype' && char === ']') this.depth--;
      else if (char === '>' && this.depth <= 0) return index + 1;
    }
    return -1;
  }
}
