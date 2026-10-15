import type {
  BlockContent,
  Blockquote,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
} from 'mdast-util-directive';
import type { ContentOutputBlock, ContentOutputData } from '../content';
import { contentIntegrationUrl } from '../content-integrations';
import { isContentEntityType } from '../content-link';
import { decodeHtmlEntities, inlineHtmlToPhrasing } from './inline';
import { theiLinkUrl } from './links';
import { directiveAttributeValue, writeEditMarkdown } from './syntax';

/**
 * A stored text as editing Markdown: what an AI client reads, and what it
 * writes back.
 *
 * Unlike the public Markdown copy (`shared/content-markdown.ts`), nothing is
 * left out and nothing is typeset: private sections, spoilers, captions and
 * notes are all there, with files and links named by id. The two must agree:
 * whatever this writes, `parse.ts` reads back into the same blocks.
 */
export function contentToEditMarkdown(
  data: ContentOutputData | null | undefined,
): string {
  return writeEditMarkdown(contentToEditTree(data));
}

type FlowParent = { children: RootContent[] };

export function contentToEditTree(
  data: ContentOutputData | null | undefined,
): Root {
  const root: Root = { type: 'root', children: [] };
  const stack: { node: FlowParent; sectionId?: string }[] = [{ node: root }];
  for (const block of data?.blocks ?? []) {
    const current = stack.at(-1)!;
    if (block.type === 'privateSectionBoundary') {
      const { sectionId, edge } = block.data as {
        sectionId: string;
        edge: 'start' | 'end';
      };
      if (edge === 'start') {
        const section: ContainerDirective = {
          type: 'containerDirective',
          name: 'private',
          attributes: attributes({ id: sectionId }),
          children: [],
        };
        current.node.children.push(section);
        stack.push({ node: section as FlowParent, sectionId });
      } else if (stack.length > 1 && current.sectionId === sectionId) {
        stack.pop();
      }
      continue;
    }

    const nodes = blockToNodes(block);
    if (block.tunes?.spoiler) {
      const last = current.node.children.at(-1);
      const group =
        last?.type === 'containerDirective' && last.name === 'spoiler'
          ? last
          : undefined;
      if (group) group.children.push(...(nodes as BlockContent[]));
      else
        current.node.children.push({
          type: 'containerDirective',
          name: 'spoiler',
          attributes: {},
          children: nodes as BlockContent[],
        });
    } else {
      current.node.children.push(...nodes);
    }
  }
  return root;
}

function paragraph(children: PhrasingContent[]): Paragraph {
  return { type: 'paragraph', children };
}

/** A directive's label: the words between its brackets. */
function label(children: PhrasingContent[]): Paragraph {
  return { type: 'paragraph', data: { directiveLabel: true }, children };
}

function textLabel(value: unknown): PhrasingContent[] {
  return typeof value === 'string' && value
    ? [{ type: 'text', value }]
    : [];
}

function attributes(
  values: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1] !== '',
      )
      .map(([key, value]) => [key, directiveAttributeValue(value)]),
  );
}

function assetUuid(value: unknown): string | undefined {
  const uuid = (value as { assetUuid?: unknown } | null | undefined)
    ?.assetUuid;
  return typeof uuid === 'string' ? uuid : undefined;
}

function blockToNodes(block: ContentOutputBlock): RootContent[] {
  const data = (block.data ?? {}) as Record<string, any>;
  switch (block.type) {
    case 'paragraph':
      return [paragraph(inlineHtmlToPhrasing(data.text))];

    case 'header':
      return [
        {
          type: 'heading',
          depth: data.level === 3 ? 3 : 2,
          children: [
            { type: 'text', value: decodeHtmlEntities(String(data.text ?? '')) },
          ],
        } satisfies Heading,
      ];

    case 'quote':
      return [quoteNode(data)];

    case 'list':
      return [listBlock(data)];

    case 'delimiter':
      return [{ type: 'thematicBreak' }];

    case 'contentMedia':
      return [
        {
          type: 'leafDirective',
          name: 'media',
          attributes: attributes({
            asset: assetUuid(data.asset),
            layout: data.layout,
          }),
          children: inlineHtmlToPhrasing(data.caption),
        } satisfies LeafDirective,
      ];

    case 'contentGallery':
      return [
        {
          type: 'containerDirective',
          name: 'gallery',
          attributes: {},
          children: (Array.isArray(data.items) ? data.items : []).map(
            (item: Record<string, unknown>) =>
              ({
                type: 'leafDirective',
                name: 'media',
                attributes: attributes({
                  asset: assetUuid(item.asset),
                  id: typeof item.id === 'string' ? item.id : undefined,
                }),
                children: inlineHtmlToPhrasing(item.caption),
              }) satisfies LeafDirective,
          ),
        } satisfies ContainerDirective,
      ];

    case 'contentAudio':
    case 'contentAttachment':
      return [
        {
          type: 'leafDirective',
          name: block.type === 'contentAudio' ? 'audio' : 'file',
          attributes: attributes({
            asset: assetUuid(data.asset),
            title: data.title,
          }),
          children: textLabel(data.caption),
        } satisfies LeafDirective,
      ];

    case 'externalLink':
      return [
        {
          type: 'leafDirective',
          name: 'link',
          attributes: attributes({ url: data.url }),
          children: textLabel(data.note),
        } satisfies LeafDirective,
      ];

    case 'entityLink':
      return isContentEntityType(data.entityType) && data.entityId
        ? [
            {
              type: 'leafDirective',
              name: 'card',
              attributes: attributes({
                to: theiLinkUrl({
                  entityType: data.entityType,
                  entityId: data.entityId,
                  fragment: data.fragment,
                }),
              }),
              children: textLabel(data.note),
            } satisfies LeafDirective,
          ]
        : [];

    case 'integration': {
      const url = contentIntegrationUrl(data);
      return url
        ? [
            {
              type: 'leafDirective',
              name: 'embed',
              attributes: attributes({ url }),
              children: [],
            } satisfies LeafDirective,
          ]
        : [];
    }

    default:
      return [];
  }
}

/**
 * A quote: plain `>` when it is only words, a directive when it has a caption
 * or is centred — so a caption is never mistaken for the last line of the
 * words, or the other way round.
 */
function quoteNode(data: Record<string, any>): RootContent {
  const text = inlineHtmlToPhrasing(data.text);
  const caption = inlineHtmlToPhrasing(data.caption);
  const centered = data.alignment === 'center';
  if (!caption.length && !centered)
    return {
      type: 'blockquote',
      children: [paragraph(text)],
    } satisfies Blockquote;
  return {
    type: 'containerDirective',
    name: 'quote',
    attributes: attributes({ align: centered ? 'center' : undefined }),
    children: [
      ...(caption.length ? [label(caption)] : []),
      ...(text.length ? [paragraph(text)] : []),
    ],
  } satisfies ContainerDirective;
}

function listBlock(data: Record<string, any>): RootContent {
  const style: string = data.style;
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const list = listNode(style, data.items, meta);
  const counter = meta.counterType;
  if (style === 'ordered' && typeof counter === 'string' && counter !== 'numeric')
    return {
      type: 'containerDirective',
      name: 'list',
      attributes: attributes({ counter }),
      children: [list],
    } satisfies ContainerDirective;
  return list;
}

function listNode(
  style: string,
  items: unknown,
  meta: Record<string, unknown>,
): List {
  const ordered = style === 'ordered';
  const start =
    ordered && typeof meta.start === 'number' && Number.isInteger(meta.start)
      ? meta.start
      : undefined;
  return {
    type: 'list',
    ordered,
    ...(ordered ? { start: start ?? 1 } : {}),
    spread: false,
    children: (Array.isArray(items) ? items : []).map(
      (item: Record<string, any>): ListItem => {
        const content = inlineHtmlToPhrasing(item?.content);
        const nested =
          Array.isArray(item?.items) && item.items.length
            ? [listNode(style, item.items, {})]
            : [];
        return {
          type: 'listItem',
          spread: false,
          checked:
            style === 'checklist' ? Boolean(item?.meta?.checked) : undefined,
          children: [...(content.length ? [paragraph(content)] : []), ...nested],
        };
      },
    ),
  };
}
