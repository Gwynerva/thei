import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The design documentation (`docs/design/`) names the files it describes, and
 * it is only worth reading while those names are true. A path in backticks is
 * written from the repository root; it counts as one when its first segment
 * is something at the root, such as `app/` or `tests/`, so a utility such as
 * `bg-accent/80` is left alone. Code blocks are examples and are not read.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const design = join(root, 'docs', 'design');
const readme = join(design, 'README.md');

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

const all = pages(design);
const rootEntries = new Set(readdirSync(root));

/** A page's prose, without its fenced code blocks. */
function prose(page: string): string {
  return readFileSync(page, 'utf8').replace(
    /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm,
    '',
  );
}

/** The paths from the repository root a page names in backticks. */
function repoPaths(page: string): string[] {
  const paths = new Set<string>();
  for (const [, code] of prose(page).matchAll(/`([^`\n]+)`/g)) {
    const candidate = code!.trim();
    if (!candidate.includes('/') || /[\s<>*{}…:]/.test(candidate)) continue;
    const first = candidate.split('/')[0]!;
    if (rootEntries.has(first)) paths.add(candidate);
  }
  return [...paths];
}

/** The local Markdown links of a page, resolved to files. */
function links(page: string): string[] {
  const targets = new Set<string>();
  for (const [, href] of prose(page).matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:|^#/i.test(href!)) continue;
    targets.add(resolve(dirname(page), href!.split('#')[0]!));
  }
  return [...targets];
}

const name = (page: string) => relative(root, page).replaceAll('\\', '/');

describe('design documentation', () => {
  it('has pages beside its README', () => {
    expect(all).toContain(readme);
    expect(all.length).toBeGreaterThan(1);
  });

  it.each(all.map((page) => [name(page), page]))(
    'names only paths that exist: %s',
    (_, page) => {
      const missing = repoPaths(page).filter(
        (path) => !existsSync(join(root, path)),
      );
      expect(missing).toEqual([]);
    },
  );

  it.each(all.map((page) => [name(page), page]))(
    'links only to files that exist: %s',
    (_, page) => {
      const broken = links(page)
        .filter((target) => !existsSync(target))
        .map(name);
      expect(broken).toEqual([]);
    },
  );

  it('lists every page in the index of its README', () => {
    const listed = new Set(links(readme));
    const unlisted = all
      .filter((page) => page !== readme && !listed.has(page))
      .map(name);
    expect(unlisted).toEqual([]);
  });
});
