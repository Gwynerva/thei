import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  SEARCH_KINDS,
  type SearchFind,
  type SearchHit,
  type SearchKind,
  type SearchResponse,
} from '#layers/thei/shared/search/api';
import type { SearchSegment } from '#layers/thei/shared/search/snippet';
import { READS } from '../annotations';
import { dayInput } from '../inputs';
import type { McpCallContext } from '../context';
import { freshSearchIndex } from '../../search/indexer';
import { runSearch } from '../../search/query';
import { guardTool, McpToolError, toolResult } from '../result';

/**
 * The site's search, as the owner searches it: every kind, private notes and
 * diary included, through the same index and the same words as the search
 * page. The answer is text grouped by kind — each entity by its ref, each
 * place it was found at by what it is and its ids — so a model opens exactly
 * the part it needs. No structured copy beside it (`../result.ts`).
 */
const KIND_HEADINGS: Record<SearchKind, string> = {
  project: 'Projects',
  'project-section': 'Project sections',
  event: 'Events',
  'diary-entry': 'Diary',
  page: 'Pages',
  file: 'Files',
  tag: 'Tags',
  profile: 'Profile',
};

function marked(segments: SearchSegment[]): string {
  return segments
    .map((segment) => (segment.mark ? `[${segment.text}]` : segment.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A ref as the other tools take it: a diary entry by its day, a file by its id. */
function refOfHit(hit: SearchHit): string {
  if (hit.kind === 'diary-entry') return `diary-entry:${hit.date ?? hit.title}`;
  if (hit.kind === 'file' && hit.file)
    return `file:${assetIdOf(hit.file.assetUuid)}`;
  return hit.ref;
}

/** A file named by its slug in a text, as the library's id. */
function assetIdOf(value: string): string {
  const { rawDb } = THEI_SERVER.useDb();
  const row = rawDb
    .prepare('SELECT assetUuid FROM assets WHERE assetUuid = ? OR slug = ?')
    .get(value, value) as { assetUuid: string } | undefined;
  return row?.assetUuid ?? value;
}

function findLine(find: SearchFind): string {
  const where = [
    find.where,
    find.label ? `«${find.label}»` : '',
    find.place?.section ? `section project-section:${find.place.section}` : '',
    find.place?.block ? `block ${find.place.block}` : '',
    find.place?.file ? `file ${assetIdOf(find.place.file)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const words = marked(find.segments);
  return `  ${where}${words ? `: ${words}` : ' (another name, never shown)'}`;
}

function hitLines(hit: SearchHit): string[] {
  const when = hit.period
    ? hit.period.startDate === hit.period.endDate
      ? hit.period.startDate
      : `${hit.period.startDate} – ${hit.period.endDate}`
    : hit.kind !== 'diary-entry' && hit.date
      ? hit.date
      : '';
  const title =
    hit.kind === 'diary-entry'
      ? ''
      : ` — ${hit.title || hit.file?.extension.toUpperCase() || ''}`;
  const parent = hit.parent ? `, of «${hit.parent.title}»` : '';
  return [
    `- ${refOfHit(hit)}${title}${parent}${when ? ` (${when})` : ''}${hit.access ? ` [${hit.access}]` : ''}`,
    ...hit.finds.map(findLine),
    ...(hit.more ? [`  … ${hit.more} more places`] : []),
  ];
}

function counts(response: SearchResponse): string {
  return SEARCH_KINDS.filter((kind) => response.facets.kinds[kind])
    .map(
      (kind) =>
        `${KIND_HEADINGS[kind].toLowerCase()} ${response.facets.kinds[kind]}`,
    )
    .join(', ');
}

export function registerSearchTool(server: McpServer, context: McpCallContext) {
  void context;
  server.registerTool(
    'search_archive',
    {
      title: 'Search the site',
      description:
        'Full-text search over everything the owner wrote, every kind, ' +
        'private notes and diary included, as the site’s own search finds ' +
        'it: every form of a word counts as the word, and a phrase in double ' +
        'quotes must stand as written. A query that names a day finds the ' +
        'diary of that day. Results come grouped by kind, best first; each ' +
        'entity by its ref, and each place it was found at — a section, a ' +
        'block, a file — with its ids and the words around the find. Open in ' +
        'full only what you need. With one kind, results come a page at a ' +
        'time by offset and limit.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Words to find'),
        kinds: z
          .array(z.enum(SEARCH_KINDS))
          .optional()
          .describe('Only these kinds; all of them when left out'),
        from: dayInput
          .optional()
          .describe('Only what falls on or after this day'),
        to: dayInput
          .optional()
          .describe('Only what falls on or before this day'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('With one kind: where the page starts'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            'With one kind: how many; otherwise how many of each kind (5)',
          ),
      }),
      annotations: READS,
    },
    ({ query, kinds, from, to, offset, limit }) =>
      guardTool(async () => {
        if (!/[\p{L}\p{N}]/u.test(query))
          throw new McpToolError('The query holds no words to look for.');
        await freshSearchIndex();
        const wanted = [...new Set(kinds ?? [])];
        const one = wanted.length === 1 ? wanted[0] : undefined;
        const response = await runSearch({
          q: query,
          audience: 'owner',
          ...(one
            ? { kind: one, offset: offset ?? 0, limit: limit ?? 20 }
            : { groupSize: limit ?? 5 }),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        });
        const groups = response.groups.filter(
          (group) => !wanted.length || wanted.includes(group.kind),
        );
        const total = one
          ? (response.facets.kinds[one] ?? 0)
          : groups.reduce((sum, group) => sum + group.total, 0);
        if (!total) return toolResult('Nothing found.');
        const start = one ? (offset ?? 0) : 0;
        if (one && !groups.length)
          return toolResult(
            `The offset ${start} is past the end: ${total} found.`,
          );
        const shown = groups.reduce((sum, group) => sum + group.hits.length, 0);
        const lines = [
          `${total} found${response.keyboard ? ` for «${response.keyboard}» (the query as typed on the other keyboard)` : ''}: ${counts(response)}`,
        ];
        for (const group of groups) {
          lines.push(`## ${KIND_HEADINGS[group.kind]}`);
          for (const hit of group.hits) lines.push(...hitLines(hit));
          if (!one && group.total > group.hits.length)
            lines.push(
              `  (${group.total - group.hits.length} more: ask with kinds: ["${group.kind}"])`,
            );
        }
        if (one && start + shown < total)
          lines.push(`next offset: ${start + shown}`);
        return toolResult(lines.join('\n'));
      }),
  );
}
