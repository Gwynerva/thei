import sharp from 'sharp';

/**
 * What a picture is made of, counted in blocks of 16×16 pixels of its
 * brightness: the share that is one flat value, and the share that holds only
 * a few. A photograph has next to none of either — a sensor's noise alone
 * puts dozens of values in a block — while a logo, a diagram or a screenshot
 * of an interface is mostly such blocks, whatever its size.
 *
 * The count is the one AV1 encoders decide "screen content" by (libaom,
 * `estimate_screen_content`), with the flat blocks counted too: a large
 * drawing is nearly all flat blocks, its edges a thin rim of the rest.
 */
export interface ImageContentStats {
  /** Whole blocks counted. */
  blocks: number;
  /** Share of blocks of a single value. */
  flat: number;
  /** Share of blocks of two to `FEW_COLOURS` values. */
  few: number;
}

const BLOCK = 16;
/** libaom's `kColorThresh`: a block of this many values or fewer is drawn. */
const FEW_COLOURS = 4;
/**
 * Pixels read at most. A larger picture is sampled by the nearest pixel, each
 * taken as it is, so a flat field stays flat and noise stays noise; averaging
 * would turn the one into gradients and smooth the other away.
 *
 * One case is averaged all the same: a JPEG that has to shrink four times or
 * more — 64 megapixels and up — is decoded by libjpeg at half its size, or a
 * quarter, an eighth, before the sampling (sharp's shrink-on-load, which
 * `fastShrinkOnLoad: false` only keeps one step short of the size wanted,
 * never off). Its count is then of the averaged pixels.
 */
const MAX_PIXELS = 4_000_000;

/** How many blocks hold each number of distinct values; index 0 is unused. */
export function blockColourHistogram(
  luma: Uint8Array,
  width: number,
  height: number,
): Uint32Array {
  const histogram = new Uint32Array(BLOCK * BLOCK + 1);
  // The block a value was last seen in, so nothing is cleared between blocks.
  const seenIn = new Uint32Array(256);
  let block = 0;
  for (let top = 0; top + BLOCK <= height; top += BLOCK) {
    for (let left = 0; left + BLOCK <= width; left += BLOCK) {
      block += 1;
      let colours = 0;
      for (let y = top; y < top + BLOCK; y += 1) {
        const row = y * width;
        for (let x = left; x < left + BLOCK; x += 1) {
          const value = luma[row + x]!;
          if (seenIn[value] !== block) {
            seenIn[value] = block;
            colours += 1;
          }
        }
      }
      histogram[colours]! += 1;
    }
  }
  return histogram;
}

export function imageContentStats(histogram: Uint32Array): ImageContentStats {
  let blocks = 0;
  let few = 0;
  for (let colours = 1; colours < histogram.length; colours += 1) {
    blocks += histogram[colours]!;
    if (colours > 1 && colours <= FEW_COLOURS) few += histogram[colours]!;
  }
  if (!blocks) return { blocks: 0, flat: 0, few: 0 };
  return { blocks, flat: histogram[1]! / blocks, few: few / blocks };
}

/**
 * The picture's brightness as raw bytes, sampled down when it is large.
 *
 * Transparency is laid over grey, so a white mark and a black one both
 * stand out of it. Decoded pixels, never the file: at most `MAX_PIXELS`
 * bytes leave libvips.
 */
export async function readImageLuma(
  path: string,
  maxPixels = MAX_PIXELS,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const metadata = await sharp(path, { animated: false }).metadata();
  const { width, height } = metadata.autoOrient;
  let pipeline = sharp(path, { animated: false, failOn: 'truncated' })
    .flatten({ background: '#808080' })
    .greyscale();
  const pixels = width * height;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    pipeline = pipeline.resize(
      Math.max(BLOCK, Math.round(metadata.width * scale)),
      Math.max(BLOCK, Math.round(metadata.height * scale)),
      { fit: 'fill', kernel: 'nearest', fastShrinkOnLoad: false },
    );
  }
  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Flattened and greyscale, the picture leaves as one channel.
  return { data, width: info.width, height: info.height };
}

/**
 * Whether the counts are a photograph's — or a render's, a painted
 * screenshot's: little enough of it is drawn that lossless WebP cannot come
 * out the smallest, so "Auto" gives it AVIF without encoding anything else.
 * The other way round nothing is claimed: a picture not surely one has all
 * three formats weighed by their real sizes, which costs time and never
 * bytes.
 *
 * On the bench's corpus (`bun run bench:image-content`,
 * docs/media-quality.md) lossless first wins where 24% of the blocks are
 * drawn, and the least drawn logo or diagram has 13%; the threshold stands
 * well under both. A picture of a few blocks says too little to tell.
 */
export function isPhotograph(stats: ImageContentStats): boolean {
  return (
    stats.blocks >= PHOTO_MIN_BLOCKS &&
    stats.flat + stats.few < PHOTO_MAX_DRAWN_SHARE
  );
}

const PHOTO_MIN_BLOCKS = 64;
const PHOTO_MAX_DRAWN_SHARE = 0.1;

export async function measureImageContent(
  path: string,
): Promise<ImageContentStats> {
  const { data, width, height } = await readImageLuma(path);
  return imageContentStats(blockColourHistogram(data, width, height));
}
