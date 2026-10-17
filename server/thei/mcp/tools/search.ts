import type { McpServer } from '@modelcontextprotocol/server';
import { READS } from '../annotations';
import { z } from 'zod';
import { dayInput } from '../inputs';
import {
  normalizeTermText,
  stemTerm,
  wordTokens,
} from '#layers/thei/shared/text-terms';
import type { McpCallContext } from '../context';
import { documentTouches, loadDocuments, type McpDocument } from '../documents';
import { ENTITY_KINDS } from '../../entity-kinds';
import { formatPeriod } from '../render';
import { guardTool, McpToolError, toolResult } from '../result';

const EXCERPT_RADIUS = 90;

/**
 * Words, not characters: every form of a word counts as the word, as the
 * site's own search reads Russian and English. A phrase in quotes must stand
 * as it is.
 */
function readQuery(query: string) {
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((match) =>
    normalizeTermText(match[1]!.trim()),
  );
  const rest = query.replace(/"[^"]*"/g, ' ');
  const stems = [...new Set(wordTokens(rest).map(stemTerm))];
  return { phrases, stems };
}

function excerpt(text: string, query: string): string {
  const normalized = normalizeTermText(text);
  let index = -1;
  for (const token of wordTokens(query)) {
    const stem = stemTerm(token);
    index = normalized.indexOf(stem.length >= 3 ? stem : token);
    if (index >= 0) break;
  }
  if (index < 0) index = 0;
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

function score(
  document: McpDocument,
  query: ReturnType<typeof readQuery>,
): number {
  const text = normalizeTermText(document.text);
  if (query.phrases.some((phrase) => !text.includes(phrase))) return 0;
  if (!query.stems.length) return query.phrases.length ? 1 : 0;
  const stems = stemsOf(document);
  const found = query.stems.filter((stem) => stems.has(stem)).length;
  if (!found) return 0;
  const titleStems = new Set(wordTokens(document.title).map(stemTerm));
  const inTitle = query.stems.filter((stem) => titleStems.has(stem)).length;
  // Every word found beats any title bonus: a search is for all of them.
  return found * 10 + inTitle * 3 + (found === query.stems.length ? 100 : 0);
}

/** A record's stems, worked out once for as long as the record is kept. */
const stemCache = new WeakMap<McpDocument, Set<string>>();
function stemsOf(document: McpDocument): Set<string> {
  let stems = stemCache.get(document);
  if (!stems) {
    stems = new Set(wordTokens(document.text).map(stemTerm));
    stemCache.set(document, stems);
  }
  return stems;
}

export function registerSearchTool(server: McpServer, context: McpCallContext) {
  void context;
  server.registerTool(
    'search_archive',
    {
      title: 'Search the site',
      description:
        'Full-text search over every entity, diary entries and private ' +
        'notes included. Every form of a word counts as the word; put a ' +
        'phrase in double quotes to find it as written. Results come best ' +
        'first, each with a ref, the words around what matched and the ' +
        "entity's keywords: open in full only what you need.",
      inputSchema: z.object({
        query: z.string().min(1).describe('Words to find'),
        kinds: z
          .array(z.enum(ENTITY_KINDS))
          .optional()
          .describe('Only these kinds; all of them when left out'),
        from: dayInput
          .optional()
          .describe('Only what falls on or after this day'),
        to: dayInput
          .optional()
          .describe('Only what falls on or before this day'),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: READS,
    },
    ({ query, kinds, from, to, offset, limit }) =>
      guardTool(() => {
        const parsed = readQuery(query);
        if (!parsed.stems.length && !parsed.phrases.length)
          throw new McpToolError('The query holds no words to look for.');
        const found = loadDocuments(kinds?.length ? kinds : ENTITY_KINDS)
          .filter((document) => documentTouches(document, from, to))
          .map((document) => ({ document, score: score(document, parsed) }))
          .filter((result) => result.score > 0)
          .sort(
            (a, b) =>
              b.score - a.score || b.document.updatedAt - a.document.updatedAt,
          );
        const start = offset ?? 0;
        const page = found.slice(start, start + (limit ?? 20));
        const results = page.map(({ document }) => ({
          ref: document.ref,
          kind: document.kind,
          title: document.title,
          ...(document.access ? { access: document.access } : {}),
          ...(document.periods?.length
            ? { when: document.periods.map(formatPeriod).join('; ') }
            : {}),
          excerpt: excerpt(document.text, query),
          keywords: document.keywords,
        }));
        const next =
          start + page.length < found.length ? start + page.length : null;
        return toolResult(
          results.length
            ? [
                `${found.length} found; showing ${start + 1}–${start + page.length}${next !== null ? ` (next offset: ${next})` : ''}`,
                ...results.map(
                  (result) =>
                    `- ${result.ref} — ${result.title}${'when' in result ? ` (${result.when})` : ''}${result.access && result.access !== 'public' ? ` [${result.access}]` : ''}\n  ${result.excerpt}${result.keywords.length ? `\n  keywords: ${result.keywords.join(', ')}` : ''}`,
                ),
              ].join('\n')
            : found.length
              ? `The offset ${start} is past the end: ${found.length} found.`
              : 'Nothing found.',
        );
      }),
  );
}
