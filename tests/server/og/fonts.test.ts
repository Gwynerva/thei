import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  OG_FONT_FAMILY,
  OG_FONT_FILES,
} from '../../../server/thei/og/font-set';
import {
  el,
  onOgMissingGlyphs,
  renderOgSvg,
} from '../../../server/thei/og/render';
import { stubOgFonts } from '../../helpers/og-fonts';

const require = createRequire(import.meta.url);

beforeAll(() => stubOgFonts());
afterAll(() => vi.unstubAllGlobals());
afterEach(() => onOgMissingGlyphs(undefined));

async function missingIn(text: string, style: Record<string, unknown> = {}) {
  const missing: string[] = [];
  onOgMissingGlyphs((_language, segment) => missing.push(segment));
  await renderOgSvg(
    el('div', {
      style: {
        display: 'flex',
        fontFamily: OG_FONT_FAMILY,
        fontSize: 40,
        ...style,
      },
      children: text,
    }),
    { width: 1200 },
  );
  return missing;
}

describe('card fonts', () => {
  it('ship every file the list names', () => {
    for (const { file } of OG_FONT_FILES)
      expect(
        existsSync(require.resolve(`@fontsource/noto-sans/files/${file}`)),
        file,
      ).toBe(true);
  });

  it('draw the scripts of the languages a site is written in', async () => {
    for (const text of [
      'Zażółć gęślą jaźń — Příliš žluťoučký kůň, Ğüşiöç',
      'Съешь же ещё этих мягких французских булок',
      'Ґанок, їжак, Ҷумъа, Ӂ',
      'Ελληνικά γράμματα',
      'Tiếng Việt có dấu',
      '«Ёлки» — “quotes” … № 5 · 100 %',
    ])
      for (const style of [
        { fontWeight: 400 },
        { fontWeight: 600 },
        { fontWeight: 700 },
        { fontWeight: 400, fontStyle: 'italic' },
      ])
        expect(await missingIn(text, style), text).toEqual([]);
  });

  it('report a script no shipped font covers', async () => {
    expect((await missingIn('漢字')).length).toBeGreaterThan(0);
  });
});
