import type { McpServer } from '@modelcontextprotocol/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { findTarget, type ActionTarget } from '../../ai/actions/target';
import { findSession, sessionMessages } from '../../ai/sessions/store';
import {
  busySubjects,
  coverageOf,
  holdBatch,
} from '../../ai/templates/coverage';
import { TEMPLATE_SOURCES } from '../../ai/templates/sources';
import { findTemplate } from '../../ai/templates/store';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { guardTool, McpToolError, toolResult } from '../result';

/** The tool a worded run's model asks for its batch with. */
export const CHECK_BATCH_TOOL = 'check_batch';

/**
 * The one tool of a built-in check's own session: what the owner's words
 * narrow the check to — some areas, some entities — given as a batch of
 * what of that is due, held for the run like a batch given at its start.
 * Only Thei's own model works in such a session; no app is offered it.
 */
export function registerCheckTools(server: McpServer, context: McpCallContext) {
  const own = context.session;
  if (!own) return;
  const session = findSession(own.sessionUuid);
  const template = session?.templateId
    ? findTemplate(session.templateId)
    : undefined;
  const key = template?.builtin;
  if (session?.origin !== 'template' || !template || !key) return;
  const source = TEMPLATE_SOURCES[key];
  server.registerTool(
    CHECK_BATCH_TOOL,
    {
      title: 'What the check is to look at',
      description:
        'Gives this check’s batch: of the areas and entities the owner’s ' +
        'words ask for, what the check has not looked at yet, as it reads ' +
        `now. Its areas: ${Object.keys(source.areas).join(', ')}. Leave ` +
        'areas or refs out for all of them. Once a turn.',
      inputSchema: z.object({
        areas: z.array(z.string()).optional(),
        refs: z
          .array(z.string())
          .optional()
          .describe('Entities and files, by ref (asset:<id> for a file)'),
      }),
      annotations: READS,
    },
    ({ areas, refs }) =>
      guardTool(async () => {
        const part = sessionMessages(own.sessionUuid)
          .flatMap((message) => message.parts as AiMessagePart[])
          .find(
            (item): item is Extract<AiMessagePart, { type: 'template' }> =>
              item.type === 'template',
          );
        const unknown = (areas ?? []).filter((area) => !(area in source.areas));
        if (unknown.length)
          throw new McpToolError(
            `This check has no area ${unknown.join(', ')}; its areas are ${Object.keys(source.areas).join(', ')}.`,
          );
        const bound = part?.scope?.flatMap((ref) => findTarget(ref) ?? []);
        const named = refs?.map(
          (ref) =>
            findTarget(ref) ??
            (() => {
              throw new McpToolError(`There is no entity ${ref}.`);
            })(),
        );
        // What the owner's words name stays within what the run is about.
        const outside = named?.filter(
          (key) =>
            bound &&
            !bound.some((item) => item.kind === key.kind && item.id === key.id),
        );
        if (outside?.length)
          throw new McpToolError(
            `This run looks only at ${part!.scope!.join(', ')}.`,
          );
        const scope: ActionTarget[] | undefined = named?.length ? named : bound;
        const templateId = template.templateId;
        const { db, schema } = THEI_SERVER.useDb();
        const holds = db
          .select({ subject: schema.aiTemplateBatches.subject })
          .from(schema.aiTemplateBatches)
          .where(eq(schema.aiTemplateBatches.sessionUuid, own.sessionUuid))
          .get();
        if (holds)
          throw new McpToolError(
            'This turn holds its batch already: work with what it gave.',
          );
        const due = await source.due({
          scope,
          areas: areas?.length ? new Set(areas) : undefined,
          covered: coverageOf(templateId),
          busy: busySubjects(templateId),
        });
        const given = db.transaction((tx) =>
          own.live()
            ? holdBatch(tx, schema, templateId, own.sessionUuid, due)
            : [],
        );
        if (!given.length)
          return toolResult(
            'Nothing of that is due: the check has looked at all of it as it reads now.',
          );
        return toolResult(source.brief(given));
      }),
  );
}
