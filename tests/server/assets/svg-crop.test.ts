import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { cropSvgToFile } from '../../../server/thei/assets/svg-crop';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-svg-crop-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function crop(
  svg: string,
  intrinsic: { width: number; height: number },
  output: { width: number; height: number },
  region?: { left: number; top: number; width: number; height: number },
) {
  const source = join(directory, 'source.svg');
  const target = join(directory, 'target.svg');
  await writeFile(source, svg);
  await cropSvgToFile(source, target, intrinsic, output, region);
  return await readFile(target, 'utf8');
}

describe('turning an SVG as an SVG', () => {
  // Red on the left half, blue on the right; its viewBox is not its size, so
  // the source's own layout has to keep working inside the turn.
  const halves =
    '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 20 10"><rect width="10" height="10" fill="#f00"/><rect x="10" width="10" height="10" fill="#00f"/></svg>';

  async function pixel(svg: string, x: number, y: number) {
    const { data, info } = await sharp(Buffer.from(svg))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const index = (y * info.width + x) * 3;
    return { r: data[index]!, b: data[index + 2]!, info };
  }

  async function turn(
    rotation: 90 | 180 | 270,
    output: { width: number; height: number },
    region?: { left: number; top: number; width: number; height: number },
  ) {
    const source = join(directory, 'source.svg');
    const target = join(directory, 'target.svg');
    await writeFile(source, halves);
    await cropSvgToFile(
      source,
      target,
      { width: 200, height: 100 },
      output,
      region,
      rotation,
    );
    return await readFile(target, 'utf8');
  }

  it('turns a quarter clockwise: the left half ends up on top', async () => {
    const result = await turn(90, { width: 100, height: 200 });

    expect(result.startsWith('<?xml version="1.0"?>\n<svg')).toBe(true);
    const top = await pixel(result, 50, 20);
    const bottom = await pixel(result, 50, 180);
    expect(top.info).toMatchObject({ width: 100, height: 200 });
    expect(top).toMatchObject({ r: 255, b: 0 });
    expect(bottom).toMatchObject({ r: 0, b: 255 });
  });

  it('crops the turned frame', async () => {
    const result = await turn(
      270,
      { width: 50, height: 50 },
      { left: 0, top: 100, width: 100, height: 100 },
    );

    // Turned the other way, the left half ends up at the bottom.
    expect(await pixel(result, 25, 25)).toMatchObject({ r: 255, b: 0 });
  });

  it('turns a half turn', async () => {
    const result = await turn(180, { width: 200, height: 100 });

    expect(await pixel(result, 20, 50)).toMatchObject({ r: 0, b: 255 });
    expect(await pixel(result, 180, 50)).toMatchObject({ r: 255, b: 0 });
  });
});

describe('stretching an SVG as an SVG', () => {
  it('fills a size of other proportions instead of keeping its own', async () => {
    const source = join(directory, 'source.svg');
    const target = join(directory, 'target.svg');
    // Red on the left half, blue on the right.
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 20 10"><rect width="10" height="10" fill="#f00"/><rect x="10" width="10" height="10" fill="#00f"/></svg>',
    );
    await cropSvgToFile(
      source,
      target,
      { width: 200, height: 100 },
      { width: 100, height: 300 },
      undefined,
      0,
      true,
    );
    const result = await readFile(target, 'utf8');

    expect(result).toContain('preserveAspectRatio="none"');
    const { data, info } = await sharp(Buffer.from(result))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 100, height: 300 });
    // Both halves reach the top and the bottom: nothing is letterboxed.
    const at = (x: number, y: number) => data[(y * info.width + x) * 3]!;
    expect(at(10, 2)).toBe(255);
    expect(at(10, 297)).toBe(255);
    expect(at(90, 150)).toBe(0);
  });
});

describe('cropping an SVG as an SVG', () => {
  it('narrows the viewBox to the region and keeps the drawing', async () => {
    const result = await crop(
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 20 10"><rect width="5" height="5" fill="#f00"/><text>Привет</text></svg>',
      { width: 200, height: 100 },
      { width: 512, height: 512 },
      { left: 50, top: 0, width: 100, height: 100 },
    );

    expect(result).toContain('viewBox="5 0 10 10"');
    expect(result).toContain('width="512"');
    expect(result).toContain('height="512"');
    expect(result.startsWith('<?xml version="1.0"?>\n<svg')).toBe(true);
    expect(result).toContain('<text>Привет</text></svg>');
  });

  it('adds a viewBox and a size to a drawing that had none', async () => {
    const result = await crop(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>',
      { width: 300, height: 150 },
      { width: 300, height: 150 },
    );

    expect(result).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150" width="300" height="150"><circle r="4"/></svg>',
    );
  });

  it('follows a centred viewBox of other proportions', async () => {
    // A 10x10 viewBox shown at 200x100 is scaled to 100x100 and centred, so
    // the drawing starts 50 px in.
    const result = await crop(
      "<svg width='200' height='100' viewBox='0 0 10 10'><rect/></svg>",
      { width: 200, height: 100 },
      { width: 100, height: 100 },
      { left: 50, top: 0, width: 100, height: 100 },
    );

    expect(result).toContain('viewBox="0 0 10 10"');
  });

  it('refuses a file without a root svg tag', async () => {
    await expect(
      crop('not an svg', { width: 10, height: 10 }, { width: 10, height: 10 }),
    ).rejects.toThrow('Unsupported SVG file');
  });
});
