import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { composeOgCard } from '../../../server/thei/og/compose';
import { allowedTones, chooseLayout } from '../../../server/thei/og/design';
import { renderOgPng } from '../../../server/thei/og/render';
import { analyzePicture } from '../../../server/thei/og/artwork';
import { stubOgFonts } from '../../helpers/og-fonts';
import { createArtwork, ogFixtures, type OgArtworkSet } from './fixtures';

/**
 * Every fixture card, drawn in the layout it would get and in each tone that
 * layout may take, as a page to look at: `bun run og:gallery`, then open
 * `tests/.artifacts/og-gallery/index.html`.
 *
 * Not a test of anything — it only runs when asked for — but the fastest way
 * to see what a change to a layout does to every kind of card at once.
 */
const enabled = Boolean(process.env.OG_GALLERY);
const output = join(
  import.meta.dirname,
  '..',
  '..',
  '.artifacts',
  'og-gallery',
);

let art: OgArtworkSet;

beforeAll(async () => {
  stubOgFonts();
  art = await createArtwork();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await art?.remove();
});

describe.runIf(enabled)('Open Graph gallery', () => {
  it('draws every fixture in every tone its layout may take', async () => {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    const figures: string[] = [];
    for (const [index, fixture] of ogFixtures(art).entries()) {
      const main = fixture.content.picture
        ? await analyzePicture(fixture.content.picture)
        : undefined;
      const tiles = (
        await Promise.all(fixture.content.tiles.map(analyzePicture))
      ).filter(Boolean).length;
      const layout = chooseLayout(fixture.content, tiles);
      for (const tone of allowedTones(layout, fixture.content, main)) {
        const started = performance.now();
        const card = await composeOgCard(fixture.content, { tone });
        const png = await renderOgPng(card.node);
        const time = Math.round(performance.now() - started);
        const file = `${String(index).padStart(2, '0')}-${card.design.layout}-${tone}.png`;
        await writeFile(join(output, file), png);
        const steps = Object.values(card.stacks)
          .flatMap((stack) => stack.steps)
          .join(', ');
        figures.push(
          `<figure><img src="${file}" loading="lazy"><figcaption><b>${fixture.name}</b> · ${card.design.layout} · ${tone} · ${time} ms${steps ? `<br><small>${steps}</small>` : ''}</figcaption></figure>`,
        );
      }
    }
    await writeFile(
      join(output, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>Open Graph gallery</title>
<style>
body{margin:0;padding:24px;background:#16181c;color:#d8dbe0;font:14px system-ui,sans-serif}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:28px}
figure{margin:0}img{width:100%;aspect-ratio:1200/630;border-radius:10px;display:block}
figcaption{margin-top:8px;line-height:1.4}small{color:#8b9099}
</style><main>${figures.join('\n')}</main>`,
    );
  }, 600_000);
});
