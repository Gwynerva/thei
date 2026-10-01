import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { composeOgCard } from '../../../server/thei/og/compose';
import { renderOgPng } from '../../../server/thei/og/render';
import { stubOgFonts } from '../../helpers/og-fonts';
import { createArtwork, ogFixtures, type OgArtworkSet } from './fixtures';

/**
 * Every fixture card as it is drawn today, pinned: a change that moves a
 * pixel of any card fails here and shows where.
 *
 * The pictures are kept at half size in a palette of 128 colours, a few
 * dozen kilobytes each, and compared with room for the antialiasing a
 * different machine or library build may do differently: a pixel counts as
 * changed when a channel moves by more than 24, and a card fails when more
 * than 0.3% of it changed. A deliberate change is recorded with
 * `OG_UPDATE_GOLDENS=1`; a failure leaves the card it drew, and the pixels
 * that differ in red, in `tests/.artifacts/og-diff`.
 */
const WIDTH = 600;
const HEIGHT = 315;
const CHANNEL_TOLERANCE = 24;
const PIXEL_TOLERANCE = 0.003;
const update = Boolean(process.env.OG_UPDATE_GOLDENS);
const goldens = join(import.meta.dirname, '__goldens__');
const artifacts = join(
  import.meta.dirname,
  '..',
  '..',
  '.artifacts',
  'og-diff',
);

let art: OgArtworkSet;

beforeAll(async () => {
  stubOgFonts();
  art = await createArtwork();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await art.remove();
});

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function raw(png: Buffer) {
  return sharp(png).removeAlpha().raw().toBuffer();
}

describe('Open Graph goldens', () => {
  it('draw every fixture as pinned', async () => {
    const failures: string[] = [];
    await mkdir(goldens, { recursive: true });
    for (const fixture of ogFixtures(art)) {
      const name = slug(fixture.name);
      const card = await composeOgCard(fixture.content);
      const drawn = await sharp(await renderOgPng(card.node))
        .resize(WIDTH, HEIGHT)
        .png({ palette: true, colors: 128, compressionLevel: 9 })
        .toBuffer();
      const path = join(goldens, `${name}.png`);
      if (update) {
        await writeFile(path, drawn);
        continue;
      }
      const golden = await readFile(path).catch(() => undefined);
      if (!golden) {
        failures.push(
          `${name}: no golden — record it with OG_UPDATE_GOLDENS=1`,
        );
        continue;
      }
      const [expected, actual] = await Promise.all([raw(golden), raw(drawn)]);
      const diff = Buffer.alloc(expected.length);
      let changed = 0;
      for (let offset = 0; offset < expected.length; offset += 3) {
        const moved =
          Math.abs(expected[offset]! - actual[offset]!) > CHANNEL_TOLERANCE ||
          Math.abs(expected[offset + 1]! - actual[offset + 1]!) >
            CHANNEL_TOLERANCE ||
          Math.abs(expected[offset + 2]! - actual[offset + 2]!) >
            CHANNEL_TOLERANCE;
        if (moved) changed++;
        diff[offset] = moved ? 255 : expected[offset]! / 4;
        diff[offset + 1] = moved ? 0 : expected[offset + 1]! / 4;
        diff[offset + 2] = moved ? 0 : expected[offset + 2]! / 4;
      }
      const share = changed / (WIDTH * HEIGHT);
      if (share > PIXEL_TOLERANCE) {
        failures.push(
          `${name}: ${(share * 100).toFixed(2)}% of pixels changed`,
        );
        await mkdir(artifacts, { recursive: true });
        await writeFile(join(artifacts, `${name}.actual.png`), drawn);
        await sharp(diff, {
          raw: { width: WIDTH, height: HEIGHT, channels: 3 },
        })
          .png()
          .toFile(join(artifacts, `${name}.diff.png`));
      }
    }
    expect(failures).toEqual([]);
  }, 240_000);
});
