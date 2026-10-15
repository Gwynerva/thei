import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { guardTool, McpToolError, toolResult } from '../result';
import { entityFingerprint } from '../../ai/digests';
import { findSession, sessionMessages } from '../../ai/sessions/store';
import { changesBetween, CHANGE_KINDS } from '../../ai/templates/changes';
import { marksOf } from '../../ai/templates/reads';

/** Changes one call lists; the rest come with offset. */
const PAGE = 100;

/**
 * The template a session runs, and when it ran before: what «since last
 * time» means in it. None outside a template's session.
 */
function templateRun(context: McpCallContext) {
  const sessionUuid = context.session?.sessionUuid;
  const session = sessionUuid ? findSession(sessionUuid) : undefined;
  if (!session?.templateId) return undefined;
  const part = sessionMessages(session.sessionUuid)
    .flatMap((message) => message.parts as AiMessagePart[])
    .find(
      (item): item is Extract<AiMessagePart, { type: 'template' }> =>
        item.type === 'template',
    );
  return { templateId: session.templateId, since: part?.since };
}

function moment(value: string, name: string): number {
  const at = Date.parse(value);
  if (Number.isNaN(at))
    throw new McpToolError(
      `${name} is a day (YYYY-MM-DD) or a moment (ISO 8601).`,
    );
  return at;
}

export function registerChangesTool(
  server: McpServer,
  context: McpCallContext,
) {
  server.registerTool(
    'changes_since',
    {
      title: 'What changed',
      description:
        'What in the archive was made or changed within a stretch of time — ' +
        'its fields or any of its texts — the latest first, with refs to ' +
        'read. In a session a template started, from defaults to the ' +
        'template’s run before, and each entry says whether the template ' +
        'read it then: of those, read_entity with since gives only what ' +
        'changed.',
      inputSchema: z.object({
        from: z
          .string()
          .optional()
          .describe(
            'A day (YYYY-MM-DD) or a moment (ISO 8601); in a template’s session, its run before by default',
          ),
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
        const run = templateRun(context);
        const fromAt = from !== undefined ? moment(from, 'from') : run?.since;
        if (fromAt === undefined)
          throw new McpToolError(
            run
              ? 'This template has not run before: name from.'
              : 'Name from: the day or moment to look from.',
          );
        const toAt = to === undefined ? undefined : moment(to, 'to');
        const changes = changesBetween({
          from: fromAt,
          to: toAt,
          kinds: kinds as never,
        });
        const start = offset ?? 0;
        const page = changes.slice(start, start + PAGE);
        const marks = run ? marksOf(run.templateId) : undefined;
        const lines = page.map((change) => {
          const day = new Date(change.changedAt).toISOString().slice(0, 10);
          const title = change.date ?? change.title;
          let read = '';
          if (marks) {
            const mark = marks.get(`${change.key.kind}:${change.key.id}`);
            read = !mark
              ? ' · not read by this template yet'
              : mark.fingerprint === entityFingerprint(change.key)
                ? ' · read by this template as it is'
                : ' · read by this template before, changed since';
          }
          return `- ${change.ref} — ${title} — changed ${day}${read}`;
        });
        return toolResult(
          {},
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
