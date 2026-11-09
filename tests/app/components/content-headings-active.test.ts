import { describe, expect, it } from 'vitest';
import {
  activeHeadingIndex,
  headingActivations,
  HEADING_ACTIVATION_SLACK,
} from '#layers/thei/app/components/content/content-headings-active';

const VIEWPORT = 800;
const OFFSET = 100;

function layout(tops: number[], documentHeight: number, height = 30) {
  return {
    headings: tops.map((top) => ({ top, height })),
    offset: OFFSET,
    maxScroll: Math.max(0, documentHeight - VIEWPORT),
    viewport: VIEWPORT,
  };
}

/** The heading current at every pixel of scrolling, in order, without repeats. */
function sequence(activations: number[], maxScroll: number) {
  const seen: number[] = [];
  for (let scrollY = 0; scrollY <= maxScroll; scrollY++) {
    const index = activeHeadingIndex(activations, scrollY);
    if (seen.at(-1) !== index) seen.push(index);
  }
  return seen;
}

describe('activeHeadingIndex', () => {
  it('finds nothing in an empty table of contents', () => {
    expect(activeHeadingIndex([], 500)).toBe(-1);
  });

  it('lights nothing while the text above the first heading is read', () => {
    expect(activeHeadingIndex([1200, 2400], 0)).toBe(-1);
    expect(activeHeadingIndex([1200, 2400], 1000)).toBe(-1);
  });

  it('takes a heading that stands at its place, or a pixel short of it', () => {
    expect(activeHeadingIndex([1200, 2400], 1200)).toBe(0);
    expect(activeHeadingIndex([1200, 2400], 1199.5)).toBe(0);
    expect(
      activeHeadingIndex([1200, 2400], 1200 - HEADING_ACTIVATION_SLACK - 1),
    ).toBe(-1);
  });

  it('keeps a heading scrolled out of sight while its section fills the window', () => {
    expect(activeHeadingIndex([0, 1200, 5000], 3000)).toBe(1);
  });

  it('takes the last heading past the last activation', () => {
    expect(activeHeadingIndex([0, 1200, 2400], 9000)).toBe(2);
  });

  it('takes the last of headings that stand at one place', () => {
    expect(activeHeadingIndex([0, 500, 500, 900], 600)).toBe(2);
  });

  it('agrees with a linear scan', () => {
    const activations = [0, 3, 3, 10, 50, 51, 52, 400];
    for (let scrollY = -10; scrollY < 500; scrollY++) {
      let expected = -1;
      for (const [index, at] of activations.entries())
        if (at <= scrollY + HEADING_ACTIVATION_SLACK) expected = index;
      expect(activeHeadingIndex(activations, scrollY)).toBe(expected);
    }
  });
});

describe('headingActivations', () => {
  it('puts a heading that can scroll up to its place where a link puts it', () => {
    expect(headingActivations(layout([300, 1500, 2600], 5000))).toEqual([
      200, 1400, 2500,
    ]);
  });

  it('lights short sections at the end of the page one by one', () => {
    // maxScroll 4200: the headings at 4400, 4600 and 4800 never reach their
    // place 100 px under the top of the window.
    const input = layout([300, 2000, 4400, 4600, 4800], 5000);
    const activations = headingActivations(input);

    // Those that can reach it keep their place.
    expect(activations.slice(0, 2)).toEqual([200, 1900]);
    // The rest rise strictly, each lit only once it is wholly in sight, the
    // last at the very bottom.
    const rest = activations.slice(2);
    for (const [index, at] of rest.entries()) {
      expect(at).toBeGreaterThan(activations[index + 1]!);
      const heading = input.headings[index + 2]!;
      expect(heading.top + heading.height - at).toBeLessThanOrEqual(VIEWPORT);
    }
    expect(rest.at(-1)).toBe(input.maxScroll);
    // Scrolling down passes through every one of them, none skipped.
    expect(sequence(activations, input.maxScroll)).toEqual([-1, 0, 1, 2, 3, 4]);
  });

  it('starts the last stretch once the previous heading is current', () => {
    // The heading at 4110 reaches its place at 4010, later than 4400 comes
    // wholly into sight (3630): the rest wait for it.
    const activations = headingActivations(layout([300, 4110, 4400], 5000));
    expect(activations).toEqual([200, 4010, 4200]);
  });

  it('lights the last heading at the bottom of the page', () => {
    const input = layout([300, 4900], 5000);
    const activations = headingActivations(input);
    expect(activeHeadingIndex(activations, input.maxScroll)).toBe(1);
    expect(activeHeadingIndex(activations, input.maxScroll - 50)).toBe(0);
  });

  it('reaches the last heading when the bottom is a fraction away', () => {
    const input = { ...layout([300, 4900], 5000), maxScroll: 4200.6 };
    const activations = headingActivations(input);
    expect(activeHeadingIndex(activations, 4200)).toBe(1);
  });

  it('lights the last heading of a page that does not scroll', () => {
    const activations = headingActivations(layout([150, 400, 600], 700));
    expect(activeHeadingIndex(activations, 0)).toBe(2);
  });

  it('lights nothing at the top of a page whose first heading is below its place', () => {
    const activations = headingActivations(layout([900, 3000], 5000));
    expect(activeHeadingIndex(activations, 0)).toBe(-1);
  });

  it('gives nothing for no headings', () => {
    expect(headingActivations(layout([], 5000))).toEqual([]);
  });
});
