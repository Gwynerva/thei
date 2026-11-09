import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANDING_ZONES } from '../../../shared/landing';

/**
 * A link lands on what the page marks with the place's own name
 * (`app/composables/landing.ts`, `docs/design/patterns/landing.md`): a hash
 * no part of a page marks lands on nothing. The sources are read for the
 * marks.
 */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const app = join(root, 'app');

const vue = readdirSync(app, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.vue'))
  .map((path) => readFileSync(join(app, path), 'utf8'));

const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('landing marks', () => {
  it('marks every part of a page a hash may name', () => {
    const unmarked = LANDING_ZONES.filter(
      (zone) =>
        !vue.some((source) => source.includes(`data-landing-zone="${zone}"`)),
    );
    expect(unmarked).toEqual([]);
  });

  // The search finds the note of an excerpt's relation on the excerpt's
  // page, at `r-<kind>~<address>` of what it is about.
  it.each([
    'app/components/public/PublicHero.vue',
    'app/components/public/PublicPageHeader.vue',
  ])('marks what an excerpt is about by its address in %s', (path) => {
    const lines = [
      ...read(path).matchAll(
        /<PublicPageParent\s[^>]*:parent="subject"[^>]*>/g,
      ),
    ].map((match) => match[0]);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines)
      expect(line).toContain(':data-relation-href="subject.href"');
  });

  it("opens the hint of a relation's note cut short in its line", () => {
    const inline = read('app/components/public/PublicRelationInline.vue');
    expect(inline).toContain('data-title-popup-clipped');
    expect(read('app/composables/landing.ts')).toMatch(
      /\[data-title-popup-clipped\]['"],\s*['"]data-title-popup['"]/,
    );
  });
});
