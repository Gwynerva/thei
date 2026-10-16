import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'vue/compiler-sfc';

/**
 * No element of Thei carries the browser's own `title`: every hint is a title
 * popup (`data-title-popup`), and a frame is named with `aria-label`
 * (`docs/design/components/hints.md`). A component's `title` prop is not the
 * attribute, so only the page's own elements are read here, by the template's
 * parse: a tag Vue does not know as an element is a component.
 */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const app = join(root, 'app');

function files(extension: string): string[] {
  return readdirSync(app, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith(extension))
    .map((path) => join(app, path));
}

const name = (file: string) => relative(root, file).replaceAll('\\', '/');

const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;
const NATIVE = 0;

type TemplateNode = {
  type: number;
  tag?: string;
  tagType?: number;
  props?: {
    type: number;
    name: string;
    arg?: { content?: string };
    exp?: { content?: string };
    loc: { start: { line: number } };
  }[];
  children?: TemplateNode[];
  loc: { start: { line: number } };
};

/** Where a template gives one of its own elements a `title`. */
function nativeTitles(node: TemplateNode, found: number[] = []): number[] {
  if (node.type === ELEMENT && node.tagType === NATIVE) {
    if (node.tag === 'title') found.push(node.loc.start.line);
    for (const prop of node.props ?? []) {
      const attribute = prop.type === ATTRIBUTE && prop.name === 'title';
      const bound =
        prop.type === DIRECTIVE &&
        prop.name === 'bind' &&
        (prop.arg
          ? prop.arg.content === 'title'
          : /(^|[{,\s])['"]?title['"]?\s*:/.test(prop.exp?.content ?? ''));
      if (attribute || bound) found.push(prop.loc.start.line);
    }
  }
  for (const child of node.children ?? []) nativeTitles(child, found);
  return found;
}

describe('native title', () => {
  it('is on no element of a template', () => {
    const found = files('.vue').flatMap((file) => {
      const { descriptor } = parse(readFileSync(file, 'utf8'), {
        filename: file,
      });
      const ast = descriptor.template?.ast as TemplateNode | undefined;
      return ast
        ? nativeTitles(ast).map((line) => `${name(file)}:${line}`)
        : [];
    });
    expect(found).toEqual([]);
  });

  it('is set by no script', () => {
    const setters = [...files('.ts'), ...files('.vue')].filter((file) =>
      /(set|toggle)Attribute(NS)?\(\s*(null\s*,\s*)?['"`]title['"`]/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(setters.map(name)).toEqual([]);
  });
});
