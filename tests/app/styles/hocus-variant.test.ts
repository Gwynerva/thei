import { readFileSync } from 'node:fs';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

/** One `@custom-variant` block of `main.css`, braces balanced. */
function customVariant(source: string, name: string) {
  const start = source.indexOf(`@custom-variant ${name}`);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  const line = source.indexOf(';', start);
  if (line > -1 && line < open) return source.slice(start, line + 1);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0)
      return source.slice(start, index + 1);
  }
  throw new Error(`unbalanced @custom-variant ${name}`);
}

const main = readFileSync(
  new URL('../../../app/styles/main.css', import.meta.url),
  'utf8',
);

async function build(candidates: string[]) {
  const { build } = await compile(
    [
      customVariant(main, 'hocus'),
      customVariant(main, 'dark'),
      '@utility applied { @apply hocus:[color:red]; }',
      '@tailwind utilities;',
    ].join('\n'),
  );
  return build(candidates);
}

/** The rules of a stylesheet, each with the `@media` it sits in, if any. */
function rules(css: string) {
  const found: { media?: string; selector: string }[] = [];
  const pattern =
    /(@media[^{]+)\{\s*([^{}]+)\{[^{}]*\}\s*\}|([^{}@]+)\{[^{}]*\}/g;
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of bare.matchAll(pattern)) {
    if (match[1])
      found.push({ media: match[1].trim(), selector: match[2]!.trim() });
    else found.push({ selector: match[3]!.trim() });
  }
  return found;
}

describe('hocus', () => {
  const candidates = [
    'hocus:[color:red]',
    'group-hocus:[color:red]',
    'group-hocus/upload:[color:red]',
    'has-hocus:[color:red]',
    'not-disabled:hocus:[color:red]',
    'hocus:not-disabled:[color:red]',
    'dark:hocus:[color:red]',
    'applied',
  ];

  it('points only where a pointer can, and focuses everywhere', async () => {
    const css = await build(candidates);
    const found = rules(css);
    for (const rule of found) {
      if (rule.selector.includes(':hover'))
        expect(rule.media, rule.selector).toBe('@media (hover: hover)');
      if (rule.selector.includes(':focus-visible'))
        expect(rule.media, rule.selector).toBeUndefined();
    }
    // Every candidate came out, both ways.
    for (const candidate of ['hocus', 'group-hocus', 'has-hocus', 'applied']) {
      const own = found.filter(({ selector }) =>
        selector.startsWith(`.${candidate}`),
      );
      expect(own.some(({ selector }) => selector.includes(':hover'))).toBe(
        true,
      );
      expect(
        own.some(({ selector }) => selector.includes(':focus-visible')),
      ).toBe(true);
    }
  });

  it('reaches the group it names', async () => {
    const css = await build(['group-hocus/upload:[color:red]']);
    expect(css).toContain(':where(.group\\/upload):hover *');
    expect(css).toContain(':where(.group\\/upload):focus-visible *');
  });
});
