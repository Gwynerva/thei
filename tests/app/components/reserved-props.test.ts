import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Vue reads `style` and `class` on a component as the element's own: where
 * props are merged, as beside a `v-bind` of an object, a `style` prop's
 * "ordered" is normalized into a CSS object before the component sees it.
 * A component names such a value otherwise (`listStyle`).
 */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const app = join(root, 'app');

const components = readdirSync(app, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.vue'))
  .map((path) => join(app, path));

/** The text of every `defineProps(…)` call, its brackets balanced. */
function propsDeclarations(source: string): string[] {
  const declarations: string[] = [];
  for (const match of source.matchAll(/defineProps\s*(<|\()/g)) {
    let depth = 0;
    let end = match.index;
    for (let i = match.index + 'defineProps'.length; i < source.length; i++) {
      const char = source[i];
      if (char === '(' || char === '<' || char === '{') depth++;
      else if (char === ')' || char === '}') depth--;
      else if (char === '>' && source[i - 1] !== '=') depth--;
      if (depth === 0 && char === ')') {
        end = i;
        break;
      }
    }
    declarations.push(source.slice(match.index, end + 1));
  }
  return declarations;
}

describe('a component’s props', () => {
  it('are never named style or class', () => {
    const offenders: string[] = [];
    for (const file of components) {
      for (const declaration of propsDeclarations(readFileSync(file, 'utf8')))
        for (const match of declaration.matchAll(
          /^\s*['"]?(style|class)['"]?\??\s*:/gm,
        ))
          offenders.push(
            `${relative(root, file).replaceAll('\\', '/')}: ${match[1]}`,
          );
    }
    expect(offenders).toEqual([]);
  });
});
