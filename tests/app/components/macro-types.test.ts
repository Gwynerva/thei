import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A component's `defineProps<T>()` and `defineEmits<T>()` are compiled from
 * `T`: the production build reads only the component's own file, so a type
 * named there but declared in another fails the build, while the type check
 * and the development server still pass. Props and emits shared between
 * components are declared at runtime instead (`content-file-card.ts`).
 */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const app = join(root, 'app');

const components = readdirSync(app, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.vue'))
  .map((path) => join(app, path));

describe('a component’s props and emits', () => {
  it('name only types declared in the component itself', () => {
    const offenders: string[] = [];
    for (const file of components) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /define(?:Props|Emits)<\s*([A-Z]\w*)\s*>/g,
      )) {
        const type = match[1]!;
        if (!new RegExp(`(?:interface|type)\\s+${type}\\b`).test(source))
          offenders.push(
            `${relative(root, file).replaceAll('\\', '/')}: ${type}`,
          );
      }
    }
    expect(offenders).toEqual([]);
  });
});
