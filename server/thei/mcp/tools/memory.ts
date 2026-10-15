import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { entityFace, findEntity, refOf } from '../../entity-kinds';
import { kindMemory, memoryLines } from '../../ai/memory/read';
import { isMemoryKind } from '../../ai/memory/store';
import { listTerms } from '../../ai/terms';
import { guardTool, McpToolError, toolResult } from '../result';

/** Entities one call may ask the memory of. */
const REFS_PER_CALL = 30;

/**
 * The AI's memory, read on its own: what is kept about some entities, about
 * a kind of entity, or the dictionary whole. read_entity already gives an
 * entity's with it; this is for the memory of several at once, or of none
 * in particular.
 */
export function registerMemoryTool(server: McpServer, context: McpCallContext) {
  void context;
  server.registerTool(
    'read_memory',
    {
      title: 'Read the memory',
      description:
        'What is remembered: about the entities named (refs), about every ' +
        'entity of a kind (kind: project, event, diary-entry…), or — with ' +
        "dictionary — every word of the owner's dictionary with what it " +
        'means. read_entity already gives an entity’s memory with it.',
      inputSchema: z.object({
        refs: z.array(z.string()).max(REFS_PER_CALL).optional(),
        kind: z.string().optional(),
        dictionary: z.boolean().optional(),
      }),
      annotations: READS,
    },
    ({ refs, kind, dictionary }) =>
      guardTool(() => {
        const lines: string[] = [];
        for (const ref of refs ?? []) {
          const key = findEntity(ref);
          if (!key) {
            lines.push(`# ${ref} — not found`, '');
            continue;
          }
          const title = entityFace(key)?.title;
          const memory = memoryLines(key);
          lines.push(
            `# ${refOf(key)}${title ? ` — ${title}` : ''}`,
            ...(memory.length ? memory : ['', '_(nothing remembered)_']),
            '',
          );
        }
        if (kind !== undefined) {
          if (!isMemoryKind(kind))
            throw new McpToolError(`There is no kind of entity "${kind}".`);
          const rows = kindMemory(kind);
          lines.push(
            `# Every ${kind}`,
            '',
            ...(rows.length
              ? rows.map(
                  (row) =>
                    `- ${row.type === 'never' ? 'never to be offered: ' : ''}${row.text}`,
                )
              : ['_(nothing remembered)_']),
            '',
          );
        }
        if (dictionary) {
          const terms = listTerms();
          lines.push(
            "# The owner's dictionary",
            '',
            ...(terms.length
              ? terms.map(
                  (term) =>
                    `- ${term.display}${term.keep ? ' (keep as written)' : ''}${term.forms.length ? ` [${term.forms.join(', ')}]` : ''}${term.note ? ` — ${term.note}` : ''}`,
                )
              : ['_(empty)_']),
            '',
          );
        }
        if (!lines.length)
          throw new McpToolError(
            'Name refs, a kind, or ask for the dictionary.',
          );
        return toolResult({}, lines.join('\n').trim());
      }),
  );
}
