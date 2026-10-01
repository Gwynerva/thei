import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { AssetType } from '../../../shared/asset';
import { createMediaPreview } from '../../../server/thei/assets/media-preview';
import {
  rasterReadySvg,
  svgBufferForRaster,
  svgNeedsSymbolSizes,
} from '../../../server/thei/assets/svg-raster-input';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-svg-raster-input-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function file(name: string, content: string | Buffer) {
  const path = join(directory, name);
  await writeFile(path, content);
  return path;
}

/** The prepared copy's text, read before it is disposed of. */
async function prepared(svg: string, chunkSize?: number) {
  const path = await file('source.svg', svg);
  const ready = await rasterReadySvg(path, { chunkSize });
  const text =
    ready.input === path ? undefined : await readFile(ready.input, 'latin1');
  await ready.dispose();
  return text;
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">';

/**
 * A light field with a dark mark repeated over it, the way a banner pattern
 * reuses a few icons: the mark is a symbol that declares its own size.
 */
function pattern(sized = false) {
  const size = sized ? ' width="10" height="10"' : '';
  const uses = Array.from({ length: 20 }, (_, index) => {
    const x = (index % 10) * 20 + 5;
    const y = Math.floor(index / 10) * 50 + 20;
    return `<use${size} href="#mark" x="${x}" y="${y}"/>`;
  }).join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<defs><symbol id="mark" viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10"/></symbol></defs>' +
    `<rect width="200" height="100" fill="#e8f4ff"/><g fill-opacity="0.5">${uses}</g></svg>`
  );
}

describe('preparing an SVG for librsvg', () => {
  it('gives a use the size its symbol declares, whatever the reads', async () => {
    const svg =
      `${SVG}<use href="#a" x="1"/><use xlink:href='#a'/><use href="#a"/>` +
      '<symbol id="a" viewBox="0 0 960 960" width="54" height="2em"><path d="M0 0h960v960z"/></symbol></svg>';
    const expected =
      `${SVG}<use width="54" height="2em" href="#a" x="1"/>` +
      `<use width="54" height="2em" xlink:href='#a'/><use width="54" height="2em" href="#a"/>` +
      '<symbol id="a" viewBox="0 0 960 960" width="54" height="2em"><path d="M0 0h960v960z"/></symbol></svg>';

    for (const chunkSize of [undefined, 1, 2, 5, 9])
      expect(await prepared(svg, chunkSize)).toBe(expected);
  });

  it('keeps a size the use sets and fills in only the other one', async () => {
    const svg = `${SVG}<symbol id="a" width="20" height="30"/><use href="#a" width="5"/><use href="#a" height="7" width="8"/></svg>`;

    expect(await prepared(svg)).toBe(
      `${SVG}<symbol id="a" width="20" height="30"/><use height="30" href="#a" width="5"/><use href="#a" height="7" width="8"/></svg>`,
    );
  });

  it('leaves alone what librsvg already draws as a browser does', async () => {
    const untouched = [
      // A symbol without a size, or with the default one.
      `${SVG}<symbol id="a" viewBox="0 0 10 10"/><use href="#a"/></svg>`,
      `${SVG}<symbol id="a" width="auto" height="auto"/><use href="#a"/></svg>`,
      // Every use already sized.
      `${SVG}<symbol id="a" width="5" height="5"/><use href="#a" width="1" height="1"/></svg>`,
      // Another element, or another file.
      `${SVG}<g id="a" width="5"/><use href="#a"/><use href="other.svg#b"/></svg>`,
      // Markup that is not markup.
      `${SVG}<!-- <symbol id="a" width="5"/> --><use href="#b"/><symbol id="b"/>` +
        `<style><![CDATA[ <use href="#a"/> ]]></style></svg>`,
    ];
    for (const svg of untouched) {
      expect(await prepared(svg)).toBeUndefined();
      expect(await svgNeedsSymbolSizes(await file('plain.svg', svg))).toBe(
        false,
      );
    }
  });

  it('reads past an XML declaration, a doctype and a byte-order mark', async () => {
    const svg =
      '﻿<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE svg [ <!ENTITY size "5"> ]>\n' +
      `${SVG}<symbol id="a" width="&size;" height="5"/><use href="#a"/><text>Ünïcode &gt; ok</text></svg>`;

    const text = await prepared(svg, 3);

    expect(Buffer.from(text!, 'latin1').toString('utf8')).toBe(
      svg.replace('<use href', '<use width="&size;" height="5" href'),
    );
  });

  it('hands anything that is not an SVG over as it is', async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#f00' },
    })
      .png()
      .toBuffer();
    const path = await file('picture.png', png);
    const xml = await file('feed.xml', '<feed><use href="#a"/></feed>');

    for (const input of [path, xml]) {
      const ready = await rasterReadySvg(input);
      expect(ready.input).toBe(input);
      expect(await svgNeedsSymbolSizes(input)).toBe(false);
    }
    expect(svgBufferForRaster(png)).toBe(png);
  });

  it('removes its copy once disposed of', async () => {
    const ready = await rasterReadySvg(await file('a.svg', pattern()));

    expect(typeof ready.input).toBe('string');
    await access(ready.input as string);
    await ready.dispose();
    await expect(access(ready.input as string)).rejects.toThrow();
  });

  it('prepares bytes held in memory the same way', () => {
    const svg = Buffer.from(pattern());

    expect(svgBufferForRaster(svg).toString()).toBe(pattern(true));
  });
});

describe('drawing an SVG that repeats sized symbols', () => {
  async function mean(input: Buffer) {
    const { channels } = await sharp(input).removeAlpha().stats();
    return channels.map((channel) => Math.round(channel.mean));
  }

  it('draws its preview as a browser draws it', async () => {
    // librsvg alone blows each mark up to the whole picture, so the field
    // all but disappears under them.
    const unprepared = await sharp(Buffer.from(pattern())).png().toBuffer();
    expect((await mean(unprepared))[0]).toBeLessThan(120);

    const path = await file('pattern.svg', pattern());
    const preview = await createMediaPreview(
      { path, size: pattern().length, hash: 'pattern', owned: false },
      AssetType.Image,
    );
    const reference = await createMediaPreview(
      Buffer.from(pattern(true)),
      AssetType.Image,
    );

    const [r, g, b] = await mean(preview.buffer);
    const [rr, rg, rb] = await mean(reference.buffer);
    expect(r).toBeGreaterThan(180);
    expect(Math.abs(r! - rr!)).toBeLessThanOrEqual(2);
    expect(Math.abs(g! - rg!)).toBeLessThanOrEqual(2);
    expect(Math.abs(b! - rb!)).toBeLessThanOrEqual(2);
  });
});
