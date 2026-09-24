import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createError } from 'h3';
import {
  rotatedDimensions,
  type AssetCropRect,
  type AssetRotation,
} from '../../../shared/asset-crop';
import type { FileDimensions } from '../../../shared/asset-upload-dimensions';

/** How far into a file the root `<svg>` tag is looked for. */
const HEAD_BYTES = 256 * 1024;

/**
 * Writes an SVG showing only a region of the source, at a new size.
 *
 * Only the root `<svg>` tag changes: its `viewBox` narrows to the region and
 * `width`/`height` become the output size, so the drawing stays a vector.
 * Everything after that tag is streamed across untouched; the file is never
 * held in memory as a whole.
 *
 * `crop` and `intrinsic` are in the pixels the source is shown at, which is
 * what the editor measured; they are mapped into the drawing's own units the
 * way a browser lays a `viewBox` out.
 *
 * A turned drawing is wrapped instead: see `turnSvgToFile`. A `stretch`ed
 * one fills its size on both axes instead of keeping its proportions.
 */
export async function cropSvgToFile(
  sourcePath: string,
  outputPath: string,
  intrinsic: FileDimensions,
  output: FileDimensions,
  crop?: AssetCropRect,
  rotation: AssetRotation = 0,
  stretch = false,
): Promise<void> {
  if (rotation) {
    return await turnSvgToFile(
      sourcePath,
      outputPath,
      intrinsic,
      output,
      rotation,
      crop,
    );
  }
  const head = await readHead(sourcePath);
  // Latin-1 keeps one character per byte, so offsets found in the text are
  // offsets in the file, and bytes outside ASCII survive the round trip.
  const text = head.toString('latin1');
  const match = /<svg\b[^>]*>/i.exec(text);
  if (!match) {
    throw createError({ statusCode: 400, message: 'Unsupported SVG file' });
  }
  const tag = match[0];
  const tagEnd = match.index + tag.length;

  const viewBox = parseViewBox(attribute(tag, 'viewBox')) ?? {
    x: 0,
    y: 0,
    width: intrinsic.width,
    height: intrinsic.height,
  };
  // Stretched, the whole frame as shown is what fills the output, margins a
  // centred viewBox left included.
  const shown = crop ?? (stretch ? { left: 0, top: 0, ...intrinsic } : null);
  const region = shown
    ? mapToViewBox(
        shown,
        intrinsic,
        viewBox,
        attribute(tag, 'preserveAspectRatio'),
      )
    : viewBox;

  let next = setAttribute(tag, 'viewBox', formatBox(region));
  next = setAttribute(next, 'width', String(output.width));
  next = setAttribute(next, 'height', String(output.height));
  if (stretch) next = setAttribute(next, 'preserveAspectRatio', 'none');

  const writer = createWriteStream(outputPath);
  writer.write(
    Buffer.concat([head.subarray(0, match.index), Buffer.from(next, 'latin1')]),
  );
  await pipeline(createReadStream(sourcePath, { start: tagEnd }), writer);
}

/**
 * Writes a turned SVG: the source, left whole at its own size, is nested in a
 * new root that turns it and shows the crop of the turned frame.
 *
 * Nesting keeps the source's own `viewBox` and `preserveAspectRatio` doing
 * what they always did, so the crop is plain pixels of the turned picture.
 * Anything before the source's root — an XML declaration, a doctype — stays
 * in front of the new root, where it is allowed.
 */
async function turnSvgToFile(
  sourcePath: string,
  outputPath: string,
  intrinsic: FileDimensions,
  output: FileDimensions,
  rotation: Exclude<AssetRotation, 0>,
  crop?: AssetCropRect,
): Promise<void> {
  const head = await readHead(sourcePath);
  const text = head.toString('latin1');
  const match = /<svg\b[^>]*>/i.exec(text);
  if (!match) {
    throw createError({ statusCode: 400, message: 'Unsupported SVG file' });
  }
  const tag = match[0];
  const selfClosing = tag.endsWith('/>');
  const frame = rotatedDimensions(intrinsic, rotation);
  const region = crop ?? { left: 0, top: 0, ...frame };

  let inner = setAttribute(tag, 'width', String(intrinsic.width));
  inner = setAttribute(inner, 'height', String(intrinsic.height));
  const outer =
    '<svg xmlns="http://www.w3.org/2000/svg"' +
    ` width="${output.width}" height="${output.height}"` +
    ` viewBox="${formatBox({ x: region.left, y: region.top, width: region.width, height: region.height })}"` +
    ' preserveAspectRatio="none">' +
    `<g transform="${TURN_TRANSFORMS[rotation](intrinsic)}">`;

  const writer = createWriteStream(outputPath);
  writer.write(
    Buffer.concat([
      head.subarray(0, match.index),
      Buffer.from(outer + inner, 'latin1'),
    ]),
  );
  if (!selfClosing) {
    await pipeline(
      createReadStream(sourcePath, { start: match.index + tag.length }),
      writer,
      { end: false },
    );
  }
  await new Promise<void>((resolve, reject) => {
    writer.end('</g></svg>\n', () => resolve());
    writer.once('error', reject);
  });
}

/** Maps the unturned drawing onto the turned frame, clockwise. */
const TURN_TRANSFORMS: Record<
  Exclude<AssetRotation, 0>,
  (size: FileDimensions) => string
> = {
  90: (size) => `translate(${size.height} 0) rotate(90)`,
  180: (size) => `translate(${size.width} ${size.height}) rotate(180)`,
  270: (size) => `translate(0 ${size.width}) rotate(270)`,
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function readHead(path: string): Promise<Buffer> {
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await file.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function attributePattern(name: string): RegExp {
  return new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*')`, 'i');
}

function attribute(tag: string, name: string): string | undefined {
  const match = attributePattern(name).exec(tag);
  return match ? match[2]!.slice(1, -1) : undefined;
}

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = attributePattern(name);
  if (pattern.test(tag)) return tag.replace(pattern, `$1"${value}"`);
  const close = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1;
  return `${tag.slice(0, close)} ${name}="${value}"${tag.slice(close)}`;
}

function parseViewBox(value: string | undefined): Box | undefined {
  const parts = value
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    !parts ||
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part))
  )
    return undefined;
  const [x, y, width, height] = parts as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/**
 * The region in the drawing's units. With the default `xMidYMid meet` a
 * `viewBox` of other proportions than the drawing's size is scaled to fit and
 * centred; with `none` each axis is stretched on its own.
 */
function mapToViewBox(
  crop: AssetCropRect,
  intrinsic: FileDimensions,
  viewBox: Box,
  preserveAspectRatio: string | undefined,
): Box {
  if (preserveAspectRatio?.trim().startsWith('none')) {
    const sx = viewBox.width / intrinsic.width;
    const sy = viewBox.height / intrinsic.height;
    return {
      x: viewBox.x + crop.left * sx,
      y: viewBox.y + crop.top * sy,
      width: crop.width * sx,
      height: crop.height * sy,
    };
  }
  const scale = Math.min(
    intrinsic.width / viewBox.width,
    intrinsic.height / viewBox.height,
  );
  const offsetX = (intrinsic.width - viewBox.width * scale) / 2;
  const offsetY = (intrinsic.height - viewBox.height * scale) / 2;
  return {
    x: viewBox.x + (crop.left - offsetX) / scale,
    y: viewBox.y + (crop.top - offsetY) / scale,
    width: crop.width / scale,
    height: crop.height / scale,
  };
}

function formatBox(box: Box): string {
  return [box.x, box.y, box.width, box.height]
    .map((value) => Number(value.toFixed(4)))
    .join(' ');
}
