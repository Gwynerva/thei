import type { McpServer } from '@modelcontextprotocol/server';
import { READS } from '../annotations';
import { z } from 'zod';
import { accessInput, dayInput } from '../inputs';
import type { McpCallContext } from '../context';
import { digestLine, documentTouches, loadDocuments } from '../documents';
import { ENTITY_KINDS } from '../../entity-kinds';
import { formatPeriod } from '../render';
import { guardTool, toolResult } from '../result';

/**
 * Every entity of a kind, a page at a time, in compact rows: the way to go
 * over the whole site without reading each thing in full.
 */
export function registerListTool(server: McpServer, context: McpCallContext) {
  void context;
  server.registerTool(
    'list_entities',
    {
      title: 'List entities of a kind',
      description:
        'Every entity of one kind as a digest, a page at a time — for going ' +
        'over the whole site without reading each in full: its title and ' +
        'dates, its summary or opening words, and its keywords; a tag also ' +
        'with its synonyms and what it is on. Diary entries come newest ' +
        'first, the rest by when they last changed. Filters narrow it: days, ' +
        'access, a tag, entities with no relations at all, or changed after ' +
        'a moment.',
      inputSchema: z.object({
        kind: z.enum(ENTITY_KINDS),
        from: dayInput.optional(),
        to: dayInput.optional(),
        access: accessInput.optional(),
        tag: z.string().optional().describe('A tag ref: tag:<id>'),
        withoutRelations: z
          .boolean()
          .optional()
          .describe('Only projects, events or diary entries with no relation'),
        changedAfter: z
          .number()
          .optional()
          .describe('Only what changed after this moment, in ms since 1970'),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: READS,
    },
    (input) =>
      guardTool(() => {
        const all = loadDocuments([input.kind])
          .filter((document) => documentTouches(document, input.from, input.to))
          .filter(
            (document) => !input.access || document.access === input.access,
          )
          .filter(
            (document) => !input.tag || document.tagRefs?.includes(input.tag),
          )
          .filter(
            (document) =>
              !input.withoutRelations || document.relationCount === 0,
          )
          .filter(
            (document) =>
              input.changedAfter === undefined ||
              document.updatedAt > input.changedAfter,
          )
          .sort((a, b) =>
            a.date && b.date
              ? b.date.localeCompare(a.date)
              : b.updatedAt - a.updatedAt,
          );
        const offset = input.offset ?? 0;
        const page = all.slice(offset, offset + (input.limit ?? 50));
        const next =
          offset + page.length < all.length ? offset + page.length : null;
        if (!page.length)
          return toolResult(
            all.length
              ? `The offset ${offset} is past the end: ${all.length} in all.`
              : '0 in all.',
          );
        return toolResult(
          [
            `${all.length} in all; showing ${offset + 1}–${offset + page.length}${next !== null ? ` (next offset: ${next})` : ''}`,
            ...page.map((document) => {
              const lines = [
                digestLine(
                  document,
                  document.periods?.length
                    ? document.periods.map(formatPeriod).join('; ')
                    : undefined,
                ),
              ];
              if (document.project) lines.push(`  in ${document.project}`);
              if (document.relationCount !== undefined)
                lines.push(`  relations: ${document.relationCount}`);
              if (document.synonyms?.length)
                lines.push(`  synonyms: ${document.synonyms.join(', ')}`);
              if (document.usedBy)
                lines.push(
                  `  on ${document.usedBy.length}: ${document.usedBy.join(', ') || '—'}`,
                );
              return lines.join('\n');
            }),
          ].join('\n'),
        );
      }),
  );
}
