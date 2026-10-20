// Lab Markdown (FORMAT.md) — the archive's way of writing a text — into the
// blocks Thei stores. It is Thei's editing Markdown with the archive's names
// in it: `file="<id>"` for `asset="<uuid>"`, `ref:<kind>:<id>` for
// `thei:<kind>/<uuid>`, and no ids of items or private parts. So the text is
// read with Thei's own reader, its names turned into the site's, written back
// with Thei's own writer, and read into blocks by the very parser an AI
// client's edits go through.
import { createHash } from 'node:crypto';
import type { Root, RootContent } from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';
import {
  canonicalizeContentData,
  type ContentOutputData,
} from '../../../shared/content';
import { parseEditMarkdownToBlocks } from '../../../shared/content-edit-markdown/parse';
import {
  parseEditMarkdown,
  writeEditMarkdown,
} from '../../../shared/content-edit-markdown/syntax';
import { theiLinkUrl } from '../../../shared/content-edit-markdown/links';
import type { ContentEntityType } from '../../../shared/content-link';
import type { FileKind } from './model';

/** The kinds a ref names, and the kind of link Thei stores for each. */
export const REF_ENTITY_TYPES: Record<string, ContentEntityType> = {
  project: 'project',
  section: 'project-section',
  event: 'event',
  diary: 'diary-entry',
  page: 'page',
  tag: 'tag',
};

const BLOCK_DIRECTIVES = new Set([
  'media',
  'audio',
  'file',
  'link',
  'card',
  'embed',
]);
const CONTAINER_DIRECTIVES = new Set([
  'quote',
  'list',
  'gallery',
  'files',
  'private',
  'spoiler',
]);
const MARK_TAG = /^<\/?(b|i|s)>$/;
const COUNTERS = new Set([
  'numeric',
  'lower-roman',
  'upper-roman',
  'lower-alpha',
  'upper-alpha',
]);
const LAYOUTS = new Set(['centered', 'natural', 'stretch']);

/** A ref inside a text: `ref:section:lamp/idea#h:The idea` → its parts. */
export function parseTextRef(
  url: string,
): { ref: string; kind: string; fragment?: string } | undefined {
  if (!url.startsWith('ref:')) return undefined;
  const rest = url.slice(4);
  const hash = rest.indexOf('#');
  const path = hash < 0 ? rest : rest.slice(0, hash);
  const colon = path.indexOf(':');
  if (colon < 1) return undefined;
  const kind = path.slice(0, colon);
  if (!REF_ENTITY_TYPES[kind] || !path.slice(colon + 1)) return undefined;
  const fragment = hash < 0 ? undefined : rest.slice(hash + 1);
  return { ref: path, kind, ...(fragment ? { fragment } : {}) };
}

export interface TextScan {
  /** Every construct used, by name, with how often: the archive's coverage. */
  constructs: Map<string, number>;
  /** Refs the text links to, with the line. */
  refs: { ref: string; line: number; heading?: string }[];
  /** Files the text places, with the directive that places them. */
  files: {
    id: string;
    as: 'media' | 'audio' | 'file' | 'gallery' | 'files';
    line: number;
  }[];
  /** What breaks the format, with the line. */
  problems: string[];
  words: number;
}

function count(scan: TextScan, name: string) {
  scan.constructs.set(name, (scan.constructs.get(name) ?? 0) + 1);
}

function lineOf(node: { position?: { start: { line: number } } }) {
  return node.position?.start.line ?? 0;
}

function attribute(
  node: { attributes?: Record<string, string | null | undefined> | null },
  name: string,
) {
  const value = node.attributes?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * What a text uses and links to, and whether it keeps to the format. Read
 * before anything is converted: a problem here is the archive's.
 */
export function scanText(markdown: string): TextScan {
  const scan: TextScan = {
    constructs: new Map(),
    refs: [],
    files: [],
    problems: [],
    words: 0,
  };
  if (!markdown.trim()) return scan;
  const root = parseEditMarkdown(markdown);
  const problem = (node: object, message: string) =>
    scan.problems.push(`line ${lineOf(node as never)}: ${message}`);

  const visit = (node: RootContent | Root, parents: string[]) => {
    switch (node.type) {
      case 'root':
        break;
      case 'paragraph':
        if (
          !(node.data as { directiveLabel?: boolean } | undefined)
            ?.directiveLabel
        )
          count(scan, 'paragraph');
        break;
      case 'heading':
        if (node.depth !== 2 && node.depth !== 3)
          problem(node, `a heading of level ${node.depth}: only ## and ###`);
        else count(scan, `heading-${node.depth}`);
        break;
      case 'blockquote':
        count(scan, 'quote');
        break;
      case 'list': {
        const checklist = node.children.some(
          (item) => typeof item.checked === 'boolean',
        );
        count(
          scan,
          checklist
            ? 'list-checklist'
            : node.ordered
              ? 'list-ordered'
              : 'list-unordered',
        );
        if (
          node.ordered &&
          node.start !== null &&
          node.start !== undefined &&
          node.start !== 1
        )
          count(scan, 'list-start');
        if (parents.includes('listItem')) count(scan, 'list-nested');
        break;
      }
      case 'listItem':
      case 'text':
        break;
      case 'thematicBreak':
        count(scan, 'delimiter');
        break;
      case 'strong':
        count(scan, 'bold');
        break;
      case 'emphasis':
        count(scan, 'italic');
        break;
      case 'delete':
        count(scan, 'strike');
        break;
      case 'break':
        count(scan, 'line-break');
        break;
      case 'html':
        if (MARK_TAG.test(node.value.trim())) count(scan, 'mark-tag');
        else
          problem(
            node,
            `raw HTML "${node.value.slice(0, 40)}": only <b>, <i> and <s>`,
          );
        break;
      case 'link': {
        const target = parseTextRef(node.url);
        if (target) {
          count(scan, 'link-entity');
          if (target.fragment?.startsWith('h:'))
            count(scan, 'link-entity-heading');
          else if (target.fragment) count(scan, 'link-entity-fragment');
          if (node.title) count(scan, 'link-entity-note');
          scan.refs.push({
            ref: target.ref,
            line: lineOf(node),
            ...(target.fragment?.startsWith('h:')
              ? { heading: target.fragment.slice(2) }
              : {}),
          });
        } else if (node.url.startsWith('ref:')) {
          problem(node, `"${node.url}" is not ref:<kind>:<id>`);
        } else if (/^https?:\/\//i.test(node.url)) {
          count(scan, 'link-external');
          if (node.title) count(scan, 'link-external-note');
        } else if (node.url.startsWith('/')) {
          count(scan, 'link-relative');
        } else {
          problem(
            node,
            `a link to "${node.url}": write https://…, /… or ref:<kind>:<id>`,
          );
        }
        break;
      }
      case 'textDirective': {
        const directive = node as TextDirective;
        if (directive.name !== 'hint') {
          // A colon before a letter or a digit with nothing in brackets or
          // braces after it — `10:30`, `Note:this` — is only words: Thei
          // keeps them as typed, and so does the format.
          const bare =
            !directive.children.length &&
            !Object.keys(directive.attributes ?? {}).length;
          if (!bare)
            problem(
              node,
              `:${directive.name}[…] is not inline markup the format knows (escape its colon as \\:)`,
            );
        } else if (!attribute(directive, 'note'))
          problem(node, ':hint needs note="…"');
        else count(scan, 'hint');
        break;
      }
      case 'leafDirective': {
        const directive = node as LeafDirective;
        if (!BLOCK_DIRECTIVES.has(directive.name)) {
          problem(node, `::${directive.name} is not a block the format knows`);
          break;
        }
        const inside = parents.at(-1);
        if (
          directive.name === 'media' ||
          directive.name === 'audio' ||
          directive.name === 'file'
        ) {
          const id = attribute(directive, 'file');
          if (!id) problem(node, `::${directive.name} needs file="<id>"`);
          if (attribute(directive, 'asset'))
            problem(
              node,
              `::${directive.name} names its file by file="<id>", never asset=`,
            );
          const as =
            inside === 'container:gallery'
              ? 'gallery'
              : inside === 'container:files'
                ? 'files'
                : directive.name;
          if (id)
            scan.files.push({
              id,
              as: as as TextScan['files'][number]['as'],
              line: lineOf(node),
            });
          if (as === directive.name) count(scan, directive.name);
          const layout = attribute(directive, 'layout');
          if (layout && !LAYOUTS.has(layout))
            problem(
              node,
              `layout "${layout}" is not centered, natural or stretch`,
            );
          if (directive.name === 'media' && as === 'media')
            count(scan, `media-layout-${layout ?? 'centered'}`);
        } else if (directive.name === 'link') {
          if (!attribute(directive, 'url'))
            problem(node, '::link needs url="…"');
          else count(scan, 'link-card');
        } else if (directive.name === 'card') {
          const target = parseTextRef(attribute(directive, 'to') ?? '');
          if (!target) problem(node, '::card needs to="ref:<kind>:<id>"');
          else {
            count(scan, 'card');
            if (target.fragment) count(scan, 'card-fragment');
            if (directive.children.length) count(scan, 'card-note');
            scan.refs.push({
              ref: target.ref,
              line: lineOf(node),
              ...(target.fragment?.startsWith('h:')
                ? { heading: target.fragment.slice(2) }
                : {}),
            });
          }
        } else if (directive.name === 'embed') {
          const url = attribute(directive, 'url') ?? '';
          if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url))
            problem(node, '::embed takes a YouTube address only');
          else count(scan, 'embed');
        }
        if (inside === 'container:gallery' && directive.name !== 'media')
          problem(node, 'a gallery holds ::media lines only');
        if (
          inside === 'container:files' &&
          directive.name !== 'file' &&
          directive.name !== 'audio'
        )
          problem(node, 'a group of files holds ::file and ::audio lines only');
        break;
      }
      case 'containerDirective': {
        const directive = node as ContainerDirective;
        if (!CONTAINER_DIRECTIVES.has(directive.name)) {
          problem(
            node,
            `:::${directive.name} is not a container the format knows`,
          );
          break;
        }
        if (
          directive.name === 'private' &&
          parents.includes('container:private')
        )
          problem(node, 'a private part never nests in another');
        if (directive.name === 'private' && attribute(directive, 'id'))
          problem(node, 'a private part carries no id: the adapter gives it');
        if (directive.name === 'list') {
          const counter = attribute(directive, 'counter');
          if (!counter || !COUNTERS.has(counter))
            problem(node, `counter "${counter ?? ''}" is not a list counter`);
          else count(scan, `list-counter-${counter}`);
        }
        if (directive.name === 'quote') {
          count(scan, 'quote');
          if (attribute(directive, 'align') === 'center')
            count(scan, 'quote-centered');
          const label = directive.children[0];
          if (
            label?.type === 'paragraph' &&
            (label.data as { directiveLabel?: boolean } | undefined)
              ?.directiveLabel
          )
            count(scan, 'quote-caption');
        } else count(scan, directive.name);
        for (const child of directive.children)
          visit(child, [...parents, `container:${directive.name}`]);
        return;
      }
      case 'image':
      case 'imageReference':
        problem(
          node,
          'a picture is ::media[caption]{file="<id>"}, never ![]()',
        );
        break;
      case 'code':
      case 'inlineCode':
        problem(node, 'texts keep no code');
        break;
      case 'definition':
      case 'linkReference':
      case 'footnoteDefinition':
      case 'footnoteReference':
        problem(node, 'write links inline, with no definitions or footnotes');
        break;
      default:
        problem(node, `${node.type} is not something the format knows`);
    }
    if (node.type === 'text')
      scan.words += node.value.split(/\s+/).filter(Boolean).length;
    if ('children' in node)
      for (const child of (node as { children: RootContent[] }).children)
        visit(child, [...parents, node.type]);
  };
  visit(root, []);
  return scan;
}

export interface TextContext {
  /** Whose text it is, for block ids: `event:fair`. */
  owner: string;
  /** Which of its texts: `body`, `notes`, `about`. */
  slot: string;
  /** A file of the archive as the site stores it. */
  file(id: string): { assetUuid: string; kind: FileKind } | undefined;
  /** An entity the site has; a ref it has not yet keeps only its words. */
  entity(ref: string): { uuid: string } | undefined;
  /** The anchor of a heading of a target, by its words. */
  anchor?(ref: string, words: string): string | undefined;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** An id of the shape Editor.js gives a block, the same on every run. */
export function stableBlockId(seed: string): string {
  const digest = createHash('sha256').update(seed).digest();
  let id = '';
  for (let index = 0; id.length < 10; index++)
    id += BASE62[digest[index]! % 62];
  return id;
}

/**
 * A text in Lab Markdown as Thei stores it. Links to what the site does not
 * have yet keep only their words, a card to it is left out: the seeder
 * converts again once everything exists.
 */
export function convertText(
  markdown: string,
  context: TextContext,
): { data: ContentOutputData; problems: string[] } {
  const problems: string[] = [];
  if (!markdown.trim()) return { data: { blocks: [] }, problems };
  const root = parseEditMarkdown(markdown);
  let privateParts = 0;

  const linkTo = (url: string, words: string) => {
    const target = parseTextRef(url);
    if (!target) return undefined;
    const known = context.entity(target.ref);
    if (!known) return null;
    let fragment = target.fragment;
    if (fragment?.startsWith('h:')) {
      const heading = fragment.slice(2);
      fragment = context.anchor?.(target.ref, heading);
      if (!fragment)
        problems.push(`${target.ref} has no heading "${heading}" (${words})`);
    }
    return theiLinkUrl({
      entityType: REF_ENTITY_TYPES[target.kind]!,
      entityId: known.uuid,
      ...(fragment ? { fragment } : {}),
    });
  };

  const transform = (parent: { children: RootContent[] }) => {
    const children: RootContent[] = [];
    let items = 0;
    for (const node of parent.children) {
      if (node.type === 'link' && node.url.startsWith('ref:')) {
        const url = linkTo(node.url, '');
        if (url === undefined)
          problems.push(`line ${lineOf(node)}: "${node.url}" names nothing`);
        if (!url) {
          // Its words stay; the link comes on the next pass.
          transform(node);
          children.push(...(node.children as RootContent[]));
          continue;
        }
        node.url = url;
      }
      if (node.type === 'leafDirective') {
        const directive = node as LeafDirective;
        if (directive.name === 'card') {
          const url = linkTo(attribute(directive, 'to') ?? '', 'a card');
          if (!url) {
            if (url === undefined)
              problems.push(`line ${lineOf(node)}: a card names nothing`);
            continue;
          }
          directive.attributes = { ...directive.attributes, to: url };
        }
        if (
          directive.name === 'media' ||
          directive.name === 'audio' ||
          directive.name === 'file'
        ) {
          const id = attribute(directive, 'file') ?? '';
          const file = context.file(id);
          if (!file) {
            problems.push(
              `line ${lineOf(node)}: file "${id}" is not on the site; left out`,
            );
            continue;
          }
          const { file: _id, ...rest } = directive.attributes ?? {};
          directive.attributes = { ...rest, asset: file.assetUuid };
          if (parent && 'name' in parent) {
            const container = (parent as unknown as ContainerDirective).name;
            if (container === 'gallery' || container === 'files')
              directive.attributes.id = `${container === 'gallery' ? 'g' : 'f'}${++items}`;
          }
        }
      }
      if (node.type === 'containerDirective') {
        const directive = node as ContainerDirective;
        if (directive.name === 'private')
          directive.attributes = {
            ...directive.attributes,
            id: `private-${++privateParts}`,
          };
      }
      if ('children' in node) transform(node as { children: RootContent[] });
      children.push(node);
    }
    parent.children = children;
  };
  transform(root);

  const parsed = parseEditMarkdownToBlocks(writeEditMarkdown(root));
  problems.push(...parsed.warnings);
  const data = canonicalizeContentData({
    blocks: parsed.blocks as ContentOutputData['blocks'],
  });
  data.blocks = data.blocks.map((block, index) => ({
    ...block,
    id: stableBlockId(`${context.owner}|${context.slot}|${index}`),
  }));
  return { data, problems };
}
