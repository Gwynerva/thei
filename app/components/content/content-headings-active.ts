/**
 * Which entry of a table of contents the reader is in, worked out from where
 * its headings stand on the page (`app/composables/content-headings-active.ts`
 * measures them).
 *
 * Every heading is given the scroll position from which it is the current
 * one, once per layout; scrolling only looks the position up among them.
 */

/** A heading as measured, in the coordinates of the document. */
export interface MeasuredHeading {
  top: number;
  height: number;
}

export interface HeadingActivationLayout {
  /** Sorted by `top`. */
  headings: readonly MeasuredHeading[];
  /** Where a heading stands in the window once a link has led to it. */
  offset: number;
  maxScroll: number;
  viewport: number;
}

/**
 * Subpixel scrolling, a zoomed page or a rounded `scroll-margin` leave a
 * heading a fraction short of its place: it counts as there all the same.
 */
export const HEADING_ACTIVATION_SLACK = 2;

/**
 * The scroll position from which each heading is the current one.
 *
 * A heading becomes current when it reaches the line where a link to it puts
 * it, under the sticky bars. Near the end of a page the last headings may never
 * reach that line, as there is not enough page left to scroll them up to it.
 * Left alone, they would never light up, or all at once at the very bottom; a
 * line moved down for every heading would light up earlier ones too soon. So
 * only those headings are spread evenly over the last stretch of scrolling,
 * from where the previous one became current, or where the first of them is
 * wholly in sight if that comes later, down to the bottom, where the last one
 * is current. Headings that can reach the line keep their place.
 */
export function headingActivations({
  headings,
  offset,
  maxScroll,
  viewport,
}: HeadingActivationLayout): number[] {
  const activations: number[] = [];
  let unreachable = headings.length;
  for (const [index, heading] of headings.entries()) {
    const at = heading.top - offset;
    if (at > maxScroll) {
      unreachable = index;
      break;
    }
    activations.push(at);
  }
  const rest = headings.length - unreachable;
  if (!rest) return activations;

  const first = headings[unreachable]!;
  const start = Math.min(
    maxScroll,
    Math.max(activations.at(-1) ?? 0, first.top + first.height - viewport, 0),
  );
  for (let step = 1; step <= rest; step++)
    activations.push(start + ((maxScroll - start) * step) / rest);
  return activations;
}

/**
 * The heading current at a scroll position: the last one whose activation it
 * has passed, or `-1` before the first, while the text above it is read.
 */
export function activeHeadingIndex(
  activations: readonly number[],
  scrollY: number,
): number {
  const position = scrollY + HEADING_ACTIVATION_SLACK;
  let low = 0;
  let high = activations.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (activations[middle]! <= position) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
