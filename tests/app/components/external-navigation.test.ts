import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A site may be served from a subfolder, and a path in data never carries it
 * (`AGENTS.md`, "Addresses"). The router adds the base to a link and to
 * `navigateTo` — but not with `external`, which takes the path as it is: a
 * full load is the browser's, not the router's. Nor does anything add it to
 * an address handed to `location`. So each of these takes `sitePath()`, and
 * the sources are read for the ones that do not — and for a `sitePath()` the
 * router is given as well, which would carry the base twice.
 */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const app = join(root, 'app');

const sources = readdirSync(app, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(vue|ts)$/.test(path))
  .map((path) => join(app, path))
  .map((file) => ({
    name: relative(root, file).replaceAll('\\', '/'),
    text: readFileSync(file, 'utf8'),
  }));

/** The arguments of each call of `name`, read up to its closing bracket. */
function calls(text: string, name: string) {
  const found: string[] = [];
  for (const match of text.matchAll(new RegExp(`\\b${name}\\(`, 'g'))) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth && end < text.length) {
      const character = text[end++];
      if (character === '(') depth++;
      if (character === ')') depth--;
    }
    found.push(text.slice(match.index + match[0].length, end - 1));
  }
  return found;
}

describe('a page loaded in full', () => {
  it('is reached by navigateTo with the base path', () => {
    const offenders = sources.flatMap(({ name, text }) =>
      calls(text, 'navigateTo')
        .filter((args) => /\bexternal:\s*true\b/.test(args))
        .filter((args) => !args.trimStart().startsWith('sitePath('))
        .map((args) => `${name}: navigateTo(${args.trim().slice(0, 60)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('is reached by a link with the base path', () => {
    const tag = /<(?:TheiLink|NuxtLink)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    const offenders = sources.flatMap(({ name, text }) =>
      [...text.matchAll(tag)]
        .map((match) => match[1]!)
        .filter((attributes) => /(?:^|\s):?external\b/.test(attributes))
        .filter((attributes) => !/:to="[^"]*\bsitePath\(/.test(attributes))
        .map((attributes) => `${name}: <TheiLink${attributes.slice(0, 80)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('is given to location with the base path', () => {
    const literal = /location\.(?:href\s*=|assign\(|replace\()\s*[`'"]/;
    const offenders = sources
      .filter(({ text }) => literal.test(text))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});

describe('a page the router opens', () => {
  it('is reached by navigateTo without the base path', () => {
    const offenders = sources.flatMap(({ name, text }) =>
      calls(text, 'navigateTo')
        .filter((args) => /\bsitePath\(/.test(args))
        .filter((args) => !/\bexternal:\s*true\b/.test(args))
        .map((args) => `${name}: navigateTo(${args.trim().slice(0, 60)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('is reached by a link without the base path', () => {
    const tag = /<(?:TheiLink|NuxtLink)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    const offenders = sources.flatMap(({ name, text }) =>
      [...text.matchAll(tag)]
        .map((match) => match[1]!)
        .filter((attributes) => !/(?:^|\s):?external\b/.test(attributes))
        .filter((attributes) => /:to="[^"]*\bsitePath\(/.test(attributes))
        .map((attributes) => `${name}: <TheiLink${attributes.slice(0, 80)}`),
    );
    expect(offenders).toEqual([]);
  });
});
