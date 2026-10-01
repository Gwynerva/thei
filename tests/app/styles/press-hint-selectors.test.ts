import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERACTIVE_SELECTOR } from '../../../app/composables/press-hint-dom';

/**
 * The controls whose first long press shows their hint are named twice: by
 * `INTERACTIVE_SELECTOR`, which decides what a touch means, and in
 * `main.css`, which keeps the system's menu and text selection off them on
 * a touch screen, since iOS decides on its menu before a script could. The
 * two have to name the same controls, but for the ones a finger types into.
 */
const main = readFileSync(
  new URL('../../../app/styles/main.css', import.meta.url),
  'utf8',
);

/** The selector lists of the `:where(…)` groups of the touch-screen block. */
function touchGroups(): string[][] {
  const block = main.slice(main.indexOf('@media (hover: none)'));
  const groups: string[][] = [];
  let from = 0;
  while (groups.length < 2) {
    const start = block.indexOf(':where(', from) + ':where('.length;
    let depth = 1;
    let end = start;
    while (depth) {
      if (block[end] === '(') depth++;
      else if (block[end] === ')') depth--;
      end++;
    }
    groups.push(entries(block.slice(start, end - 1)));
    from = end;
  }
  return groups;
}

function entries(list: string): string[] {
  return list
    .split(/,(?![^(]*\))/)
    .map((entry) => entry.trim().replaceAll("'", '"'))
    .filter(Boolean)
    .sort();
}

/** What a finger types into: its text stays selectable. */
const TYPED_INTO = /^(input|select)\b/;

describe('the controls of the press hints', () => {
  it('are named alike by the script and the stylesheet', () => {
    const [own, inner] = touchGroups();
    const controls = entries(INTERACTIVE_SELECTOR)
      .filter((entry) => !TYPED_INTO.test(entry))
      .map((entry) => (entry === 'button' ? 'button:not(:disabled)' : entry));

    // An anchor that is a control, and an anchor inside one.
    expect(own).toEqual(controls);
    expect(inner).toEqual(
      controls.filter((entry) => entry !== '[data-title-popup-press="hold"]'),
    );
  });
});
