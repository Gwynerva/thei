import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fitText } from '../../server/thei/og/render';

/**
 * The font files travel with the build as Nitro server assets; here they are
 * read straight out of the package the module copies them from, so the
 * measurements are made with the same metrics the server uses.
 */
const require = createRequire(import.meta.url);

beforeAll(() => {
  vi.stubGlobal('useStorage', () => ({
    getItemRaw: (name: string) =>
      readFile(require.resolve(`@fontsource/noto-sans/files/${name}`)),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const options = {
  width: 568,
  maxHeight: 300,
  sizes: [72, 64, 56, 48, 40],
  lineHeight: 1.12,
  weight: 700,
  maxLines: 3,
};

describe('fitText', () => {
  it('keeps a short title at the largest size', async () => {
    const fit = await fitText('Атлас', options);
    expect(fit.fontSize).toBe(72);
    expect(fit.lineClamp).toBe(0);
  });

  it('steps down until a long title fits the space', async () => {
    const big = await fitText('Атлас', options);
    const long = await fitText(
      'Наблюдение за Белым морем в декабре и январе',
      options,
    );
    expect(long.fontSize).toBeLessThan(big.fontSize);
    expect(long.lineClamp).toBe(0);
  });

  it('shrinks rather than break a single long word', async () => {
    // At 72px this word is wider than the column, and with nowhere to wrap it
    // would either run off the card or be cut in half.
    const fit = await fitText('Экспериментальный', options);
    expect(fit.fontSize).toBeLessThan(72);
    expect(fit.lineClamp).toBe(0);
  });

  it('clamps with an ellipsis when even the smallest size overflows', async () => {
    const fit = await fitText(
      'Полностью приватный проект с закрытыми исследованиями, файлами, ' +
        'заметками команды и всем остальным, что обычно не показывают ' +
        'никому, кроме себя самого и пары очень близких людей',
      options,
    );
    expect(fit.fontSize).toBe(40);
    expect(fit.lineClamp).toBe(3);
  });
});
