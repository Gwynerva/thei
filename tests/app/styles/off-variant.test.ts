import { readFileSync } from 'node:fs';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

/**
 * `off:` is a control that does not act — disabled, or `aria-disabled` and
 * left pressable to say why (`Button.vue`, `ModalHeaderButton.vue`) — and
 * `not-off:` one that does, for the look a pointer gives only to that.
 */

const main = readFileSync(
  new URL('../../../app/styles/main.css', import.meta.url),
  'utf8',
);

function variantLine(name: string) {
  const start = main.indexOf(`@custom-variant ${name}`);
  expect(start).toBeGreaterThan(-1);
  return main.slice(start, main.indexOf(';', start) + 1);
}

async function build(candidates: string[]) {
  const { build } = await compile(
    [variantLine('off'), '@tailwind utilities;'].join('\n'),
  );
  return build(candidates).replace(/\s+/g, ' ');
}

describe('off', () => {
  it('matches a disabled control and an aria-disabled one alike', async () => {
    const css = await build(['off:[color:red]']);
    expect(css).toContain(":is(:disabled, [aria-disabled='true'])");
  });

  it('turns round with not-, for what only an acting control does', async () => {
    const css = await build(['not-off:[color:red]']);
    expect(css).toContain(":not(:is(:disabled, [aria-disabled='true']))");
  });
});
