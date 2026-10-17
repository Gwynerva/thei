import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { guardTool, McpToolError, toolResult } from '../result';
import { changesBetween, CHANGE_KINDS } from '../../ai/templates/changes';

/** Changes one call lists; the rest come with offset. */
const PAGE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A moment named by a day or by itself. A day as the end of a stretch means
 * the whole of it, to its last moment; as its start, from its first.
 */
function moment(value: string, name: string, end = false): number {
  const at = Date.parse(value);
  if (Number.isNaN(at))
    throw new McpToolError(
      `${name} is a day (YYYY-MM-DD) or a moment (ISO 8601).`,
    );
  return end && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? at + DAY_MS - 1 : at;
}

export function registerChangesTool(
  server: McpServer,
  _context: McpCallContext,
) {
  server.registerTool(
    'changes_since',
    {
      title: 'What changed',
      description:
        'What in the archive was made or changed within a stretch of time — ' +
        'its fields or any of its texts — the latest first, with refs to ' +
        'read.',
      inputSchema: z.object({
        from: z.string().describe('A day (YYYY-MM-DD) or a moment (ISO 8601)'),
        to: z.string().optional().describe('A day or a moment; now by default'),
        kinds: z
          .array(z.enum(CHANGE_KINDS as [string, ...string[]]))
          .optional()
          .describe('Only these kinds of entity'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Where to go on, as a cut-off list names it'),
      }),
      annotations: READS,
    },
    ({ from, to, kinds, offset }) =>
      guardTool(() => {
        const fromAt = moment(from, 'from');
        const toAt = to === undefined ? undefined : moment(to, 'to', true);
        const changes = changesBetween({
          from: fromAt,
          to: toAt,
          kinds: kinds as never,
        });
        const start = offset ?? 0;
        const page = changes.slice(start, start + PAGE);
        const lines = page.map((change) => {
          const day = new Date(change.changedAt).toISOString().slice(0, 10);
          return `- ${change.ref} — ${change.date ?? change.title} — changed ${day}`;
        });
        return toolResult(
          [
            `# Changed from ${new Date(fromAt).toISOString()} to ${toAt === undefined ? 'now' : new Date(toAt).toISOString()} — ${changes.length}`,
            '',
            ...(lines.length ? lines : ['_(nothing)_']),
            ...(changes.length > start + PAGE
              ? [
                  '',
                  `… ${changes.length - start - PAGE} more: changes_since with offset ${start + PAGE}`,
                ]
              : []),
          ].join('\n'),
        );
      }),
  );
}
