/**
 * Where in a video to look for the frame that stands for it, as shares of
 * its length. The opening and the very end are skipped — a fade from black,
 * a title card, a logo, the credits — and the rest is sampled evenly, so a
 * video that only comes alive halfway through is still seen doing so.
 *
 * The server's ffmpeg and the browser's `<video>` look at the same points
 * and weigh them with `frameScore`, so a preview made before upload and the
 * one the server makes afterwards agree.
 */
export const VIDEO_PREVIEW_FRAME_POSITIONS = [
  0.08, 0.2, 0.33, 0.46, 0.6, 0.73, 0.86,
];

/** Side, in pixels, a frame is scaled down to before it is scored. */
export const FRAME_SCORE_SAMPLE_SIDE = 64;

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How well a frame shows a video: the most colourful, well exposed one
 * wins.
 *
 * Colourfulness is Hasler and Süsstrunk's measure — the spread and the
 * strength of the opponent colour channels — which ranks frames the way
 * people do. It is weighed by exposure, so a black or washed-out frame
 * loses even with a tint, and a little of the brightness contrast is added,
 * so among the frames of a black-and-white film the clearest one still wins.
 *
 * `pixels` are 8-bit RGB or RGBA values, `channels` apart; fully transparent
 * pixels are left out. Scores only compare with each other.
 */
export function frameScore(pixels: ArrayLike<number>, channels: 3 | 4) {
  let count = 0;
  let sumRg = 0;
  let sumYb = 0;
  let sumRg2 = 0;
  let sumYb2 = 0;
  let sumLuma = 0;
  let sumLuma2 = 0;
  for (let index = 0; index + 2 < pixels.length; index += channels) {
    if (channels === 4 && pixels[index + 3]! < 128) continue;
    const red = pixels[index]! / 255;
    const green = pixels[index + 1]! / 255;
    const blue = pixels[index + 2]! / 255;
    const rg = red - green;
    const yb = (red + green) / 2 - blue;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    count += 1;
    sumRg += rg;
    sumYb += yb;
    sumRg2 += rg * rg;
    sumYb2 += yb * yb;
    sumLuma += luma;
    sumLuma2 += luma * luma;
  }
  if (!count) return 0;

  const meanRg = sumRg / count;
  const meanYb = sumYb / count;
  const meanLuma = sumLuma / count;
  const deviation = (sum2: number, mean: number) =>
    Math.sqrt(Math.max(0, sum2 / count - mean * mean));
  const colourfulness =
    Math.hypot(deviation(sumRg2, meanRg), deviation(sumYb2, meanYb)) +
    0.3 * Math.hypot(meanRg, meanYb);
  const contrast = deviation(sumLuma2, meanLuma);
  const exposure =
    smoothstep(0.06, 0.22, meanLuma) * (1 - smoothstep(0.88, 0.98, meanLuma));
  return exposure * (colourfulness + 0.35 * contrast);
}
