import type {
  BlockContent,
  DefinitionContent,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
} from 'mdast';
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive';
import { matchContentIntegration } from '../content-integrations';
import {
  escapeHtmlText,
  phrasingToInlineHtml,
  phrasingToPlainText,
} from './inline';
import { isTheiLinkUrl, parseTheiLinkUrl } from './links';
import { parseEditMarkdown } from './syntax';
import { newEditBlockId } from './block-key';

export { newEditBlockId };

/**
 * Editing Markdown back into stored blocks: what an AI client writes, read
 * into the document the site keeps.
 *
 * Lenient on the way in — a heading of another level, a code block, a quote
 * with its caption as a last line — and says so in `warnings`, so the client
 * learns what became of what it wrote. The blocks still go through
 * `normalizeContentData` before they are saved: that, not this, is where a
 * document is made valid.
 */
export interface ParsedEditBlock {
  type: string;
  data: Record<string, unknown>;
  tunes?: { spoiler: true };
}

export interface ParsedEditMarkdown {
  blocks: ParsedEditBlock[];
  warnings: string[];
}

interface ParseState {
  blocks: ParsedEditBlock[];
  warnings: string[];
  spoiler: boolean;
  sectionCount: number;
}

export function parseEditMarkdownToBlocks(
  markdown: string,
): ParsedEditMarkdown {
  const state: ParseState = {
    blocks: [],
    warnings: [],
    spoiler: false,
    sectionCount: 0,
  };
  const root = parseEditMarkdown(markdown);
  readFlow(root.children, state);
  warnAboutAddresses(root, state);
  return { blocks: state.blocks, warnings: state.warnings };
}

/** Links meant for this site that name nothing it has keep only their words. */
function warnAboutAddresses(node: unknown, state: ParseState) {
  const item = node as { type?: string; url?: string; children?: unknown[] };
  if (
    item.type === 'link' &&
    typeof item.url === 'string' &&
    isTheiLinkUrl(item.url) &&
    !parseTheiLinkUrl(item.url)
  )
    state.warnings.push(
      `${item.url} names nothing on the site: its words were kept without the link. Write thei:<kind>/<id>.`,
    );
  for (const child of item.children ?? []) warnAboutAddresses(child, state);
}

function push(state: ParseState, type: string, data: Record<string, unknown>) {
  state.blocks.push({
    type,
    data,
    ...(state.spoiler ? { tunes: { spoiler: true as const } } : {}),
  });
}

function readFlow(nodes: readonly RootContent[], state: ParseState) {
  for (const node of nodes) readNode(node, state);
}

function isLabel(node: RootContent | undefined): node is Paragraph {
  return (
    node?.type === 'paragraph' &&
    Boolean(
      (node.data as { directiveLabel?: boolean } | undefined)?.directiveLabel,
    )
  );
}

/** A container's label, and the rest of what it holds. */
function splitLabel(node: ContainerDirective) {
  const [first, ...rest] = node.children;
  return isLabel(first)
    ? { label: first.children, children: rest }
    : { label: [] as PhrasingContent[], children: node.children };
}

function readNode(node: RootContent, state: ParseState) {
  switch (node.type) {
    case 'paragraph':
      push(state, 'paragraph', { text: phrasingToInlineHtml(node.children) });
      return;

    case 'heading': {
      const level =
        node.depth === 3 ? 3 : node.depth === 2 ? 2 : node.depth < 2 ? 2 : 3;
      if (level !== node.depth)
        state.warnings.push(
          `A heading of level ${node.depth} became level ${level}: texts have only ## and ###.`,
        );
      push(state, 'header', {
        text: escapeHtmlText(phrasingToPlainText(node.children)),
        level,
      });
      return;
    }

    case 'blockquote':
      readBlockquote(node.children, state);
      return;

    case 'list':
      push(state, 'list', listData(node, undefined, state));
      return;

    case 'thematicBreak':
      push(state, 'delimiter', {});
      return;

    case 'code':
      state.warnings.push(
        'A code block became a paragraph: texts keep no code blocks.',
      );
      push(state, 'paragraph', {
        text: node.value.split('\n').map(escapeHtmlText).join('<br>'),
      });
      return;

    case 'html':
      push(state, 'paragraph', { text: node.value });
      return;

    case 'leafDirective':
      readLeafDirective(node, state);
      return;

    case 'containerDirective':
      readContainerDirective(node, state);
      return;

    case 'definition':
    case 'footnoteDefinition':
      state.warnings.push(
        'A link definition was left out: write links inline.',
      );
      return;

    default:
      if ('children' in node)
        readFlow((node as { children: RootContent[] }).children, state);
  }
}

/**
 * A plain `>` quote. Its words are its paragraphs; a last paragraph that
 * starts with a dash is taken for its caption, the way a quote is signed.
 */
function readBlockquote(
  children: readonly (BlockContent | DefinitionContent)[],
  state: ParseState,
) {
  const paragraphs = children.filter(
    (child): child is Paragraph => child.type === 'paragraph',
  );
  if (paragraphs.length !== children.length)
    state.warnings.push(
      'Only the words of a quote are kept: lists and other blocks inside it were flattened or left out.',
    );
  let caption = '';
  const last = paragraphs.at(-1);
  const first = last?.children[0];
  if (
    paragraphs.length > 1 &&
    first?.type === 'text' &&
    /^[—–-]\s/.test(first.value)
  ) {
    caption = phrasingToInlineHtml([
      { ...first, value: first.value.replace(/^[—–-]\s+/, '') },
      ...last!.children.slice(1),
    ]);
    paragraphs.pop();
  }
  push(state, 'quote', {
    text: paragraphs
      .map((paragraph) => phrasingToInlineHtml(paragraph.children))
      .join('<br><br>'),
    caption,
    alignment: 'left',
  });
}

function listData(
  node: List,
  counter: string | undefined,
  state: ParseState,
): Record<string, unknown> {
  const checklist = node.children.some(
    (item) => item.checked !== null && item.checked !== undefined,
  );
  const style = checklist
    ? 'checklist'
    : node.ordered
      ? 'ordered'
      : 'unordered';
  return {
    style,
    meta:
      style === 'ordered'
        ? { start: node.start ?? 1, counterType: counter ?? 'numeric' }
        : {},
    items: listItems(node.children, style, state),
  };
}

function listItems(
  items: readonly ListItem[],
  style: string,
  state: ParseState,
): Record<string, unknown>[] {
  return items.map((item) => {
    const paragraphs: string[] = [];
    const nested: ListItem[] = [];
    for (const child of item.children) {
      if (child.type === 'paragraph')
        paragraphs.push(phrasingToInlineHtml(child.children));
      else if (child.type === 'list') nested.push(...child.children);
      else
        state.warnings.push(
          'Only words and nested lists are kept inside a list item.',
        );
    }
    return {
      content: paragraphs.join('<br>'),
      meta: style === 'checklist' ? { checked: Boolean(item.checked) } : {},
      items: listItems(nested, style, state),
    };
  });
}

function attribute(node: LeafDirective | ContainerDirective, name: string) {
  const value = node.attributes?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asset(node: LeafDirective, state: ParseState) {
  const uuid = attribute(node, 'asset');
  if (!uuid)
    state.warnings.push(`::${node.name} has no asset and was left out.`);
  return uuid ? { assetUuid: uuid } : undefined;
}

function readLeafDirective(node: LeafDirective, state: ParseState) {
  switch (node.name) {
    case 'media': {
      const file = asset(node, state);
      if (!file) return;
      const layout = attribute(node, 'layout');
      push(state, 'contentMedia', {
        asset: file,
        layout:
          layout === 'natural' || layout === 'stretch' ? layout : 'centered',
        caption: phrasingToInlineHtml(node.children),
      });
      return;
    }
    case 'audio':
    case 'file': {
      const file = asset(node, state);
      if (!file) return;
      push(
        state,
        node.name === 'audio' ? 'contentAudio' : 'contentAttachment',
        {
          asset: file,
          title: attribute(node, 'title') ?? '',
          caption: phrasingToInlineHtml(node.children),
        },
      );
      return;
    }
    case 'link': {
      const url = attribute(node, 'url');
      if (!url) {
        state.warnings.push('::link has no url and was left out.');
        return;
      }
      push(state, 'externalLink', {
        url,
        note: phrasingToPlainText(node.children),
      });
      return;
    }
    case 'card': {
      const target = parseTheiLinkUrl(attribute(node, 'to') ?? '');
      if (!target) {
        state.warnings.push(
          '::card needs to="thei:<kind>/<id>" and was left out.',
        );
        return;
      }
      push(state, 'entityLink', {
        entityType: target.entityType,
        entityId: target.entityId,
        ...(target.fragment ? { fragment: target.fragment } : {}),
        note: phrasingToPlainText(node.children),
      });
      return;
    }
    case 'embed': {
      const integration = matchContentIntegration(attribute(node, 'url'));
      if (!integration) {
        state.warnings.push(
          '::embed takes a YouTube address only; it was left out.',
        );
        return;
      }
      push(state, 'integration', { ...integration });
      return;
    }
    default:
      state.warnings.push(
        `::${node.name} is not a block texts know; its words were kept as a paragraph.`,
      );
      push(state, 'paragraph', { text: phrasingToInlineHtml(node.children) });
  }
}

function readContainerDirective(node: ContainerDirective, state: ParseState) {
  const { label, children } = splitLabel(node);
  switch (node.name) {
    case 'quote': {
      const paragraphs = children.filter(
        (child): child is Paragraph => child.type === 'paragraph',
      );
      push(state, 'quote', {
        text: paragraphs
          .map((paragraph) => phrasingToInlineHtml(paragraph.children))
          .join('<br><br>'),
        caption: phrasingToInlineHtml(label),
        alignment: attribute(node, 'align') === 'center' ? 'center' : 'left',
      });
      return;
    }
    case 'list': {
      const list = children.find(
        (child): child is List => child.type === 'list',
      );
      if (list)
        push(state, 'list', listData(list, attribute(node, 'counter'), state));
      return;
    }
    case 'gallery': {
      const items = children.flatMap((child) => {
        if (child.type !== 'leafDirective' || child.name !== 'media') return [];
        const file = asset(child, state);
        return file
          ? [
              {
                id: attribute(child, 'id') ?? newEditBlockId(),
                asset: file,
                caption: phrasingToInlineHtml(child.children),
              },
            ]
          : [];
      });
      if (items.length)
        push(state, 'contentGallery', {
          title: attribute(node, 'title') ?? '',
          items,
        });
      return;
    }
    // A recording in a group is played as one alone is, whether it is
    // written as a file or as a recording.
    case 'files': {
      const items = children.flatMap((child) => {
        if (
          child.type !== 'leafDirective' ||
          (child.name !== 'file' && child.name !== 'audio')
        )
          return [];
        const file = asset(child, state);
        return file
          ? [
              {
                id: attribute(child, 'id') ?? newEditBlockId(),
                asset: file,
                title: attribute(child, 'title') ?? '',
                caption: phrasingToInlineHtml(child.children),
              },
            ]
          : [];
      });
      if (items.length)
        push(state, 'contentFileGroup', {
          title: attribute(node, 'title') ?? '',
          items,
        });
      return;
    }
    case 'private': {
      // Inside a spoiler too a private part stays private: its edges stand
      // around its blocks, which keep the spoiler they are in.
      const sectionId = attribute(node, 'id') ?? `private-${newEditBlockId()}`;
      state.sectionCount++;
      state.blocks.push({
        type: 'privateSectionBoundary',
        data: { sectionId, edge: 'start' },
      });
      readFlow(children, state);
      state.blocks.push({
        type: 'privateSectionBoundary',
        data: { sectionId, edge: 'end' },
      });
      return;
    }
    case 'spoiler': {
      const outer = state.spoiler;
      state.spoiler = true;
      readFlow(children, state);
      state.spoiler = outer;
      return;
    }
    default:
      state.warnings.push(
        `:::${node.name} is not something texts know; what it holds was kept.`,
      );
      readFlow(children, state);
  }
}
