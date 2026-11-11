import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blockColourHistogram,
  imageContentStats,
  isPhotograph,
  measureImageContent,
} from '../../../server/thei/assets/image-content';

const fixtures = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  'image-content',
);

describe('block counts', () => {
  it('tells a flat block, one of a few values and a busy one apart', () => {
    const width = 48;
    const height = 16;
    const luma = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        luma[y * width + x] =
          x < 16 ? 200 : x < 32 ? (x % 2 ? 10 : 240) : (x * 7 + y * 13) % 256;
      }
    }
    const histogram = blockColourHistogram(luma, width, height);
    expect(histogram[1]).toBe(1);
    expect(histogram[2]).toBe(1);
    expect(imageContentStats(histogram)).toEqual({
      blocks: 3,
      flat: 1 / 3,
      few: 1 / 3,
    });
  });

  it('counts whole blocks only, and nothing in a picture smaller than one', () => {
    expect(
      imageContentStats(blockColourHistogram(new Uint8Array(15 * 40), 15, 40)),
    ).toEqual({ blocks: 0, flat: 0, few: 0 });
    expect(
      imageContentStats(blockColourHistogram(new Uint8Array(40 * 40), 40, 40))
        .blocks,
    ).toBe(4);
  });

  it('claims nothing of a picture of a few blocks', () => {
    expect(isPhotograph({ blocks: 16, flat: 0, few: 0 })).toBe(false);
    expect(isPhotograph({ blocks: 64, flat: 0, few: 0 })).toBe(true);
  });
});

/**
 * Real pictures (`tests/fixtures/image-content/LICENSES.md`). A drawing is
 * never taken for a photograph, whatever its size; a photograph mostly is,
 * and one with a flat sky is left to be weighed, which costs only time.
 */
describe('what real pictures are taken for', () => {
  const pictures: [file: string, photographic: boolean][] = [
    ['photo-nasa-ksc-82pc-0331-small.jpg', true],
    ['photo-nasa-jsc2016e096719-small.jpg', true],
    ['photo-nasa-iss066e136051-medium.jpg', true],
    // A blown sky is flat blocks: not surely a photograph.
    ['photo-nasa-ksc-04pd0131-small.jpg', false],
    ['game3d-luanti-screenshot.png', true],
    ['game3d-godot-demo-projects-global-illumination.png', false],
    ['game2d-shattered-pixel-dungeon-5.png', false],
    ['game2d-unciv-civilopedia.png', false],
    ['logo-git-scm-com-git-logo-2color.png', false],
    ['logo-openttd-openttd-512.png', false],
    // 3600×3493: nearly all of a large logo is flat blocks.
    ['logo-kubernetes-logo.png', false],
    ['logo-kubernetes-name-blue.png', false],
    ['logo-openmoji-1f98a.png', false],
    // 5172×2238, read sampled.
    ['flat-website-post-ccm-arch.png', false],
    ['flat-content-shapes-reference-box.png', false],
    ['flat-docs-activity-view-icon.png', false],
    ['flat-website-components-of-kubernetes.png', false],
    ['mixed-test-devatest.png', false],
  ];

  it.each(pictures)('%s', async (file, photographic) => {
    const stats = await measureImageContent(join(fixtures, file));
    expect(isPhotograph(stats)).toBe(photographic);
  });
});
