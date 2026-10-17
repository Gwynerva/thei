import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { findTarget, type ActionTarget } from '../../ai/actions/target';
import { findSession, sessionMessages } from '../../ai/sessions/store';
import {
  busySubjects,
  coverageOf,
  holdBatch,
  rememberAsked,
  settleTemplateTurn,
} from '../../ai/templates/coverage';
import { TEMPLATE_SOURCES, type CheckItem } from '../../ai/templates/sources';
import { findTemplate } from '../../ai/templates/store';
import { READS } from '../annotations';
import type { McpCallContext } from '../context';
import { guardTool, McpToolError, toolResult } from '../result';

/** The tool a check's model asks for its next batch with. */
export const CHECK_BATCH_TOOL = 'check_batch';

/**
 * The one tool of a built-in check's own session: what the owner's words
 * narrow the check to — some areas, some entities, how many — given batch
 * after batch of what of that is due, each held for the run like a batch
 * given at its start, and each one asked after counting the one before as
 * looked at. A batch is what fits one answer whole. Only Thei's own model
 * works in such a session; no app is offered it.
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
        'Gives this check’s next batch: of the areas and entities the owner’s ' +
        'words ask for, what the check has not looked at yet, as it reads ' +
        `now. Its areas: ${Object.keys(source.areas).join(', ')}. Leave ` +
        'areas or refs out for all of them. Call it again for the batch after, ' +
        'once you have proposed for this one, as long as the owner’s words ask ' +
        'for more — "all" means until it says nothing is due; asking again ' +
        'counts the batch before as looked at.',
      inputSchema: z.object({
        areas: z.array(z.string()).optional(),
        refs: z
          .array(z.string())
          .optional()
          .describe('Entities and files, by ref (asset:<id> for a file)'),
        count: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'How many to give at most, when the owner asked for a number; a batch is never more than fits one answer',
          ),
      }),
      annotations: READS,
    },
    ({ areas, refs, count }) =>
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
        // Asked again, the run went through what it had: that counts as
        // looked at, and makes room for the next.
        settleTemplateTurn(own.sessionUuid, true);
        rememberAsked(own.sessionUuid, { areas, refs });
        const input = {
          scope,
          areas: areas?.length ? new Set(areas) : undefined,
          covered: coverageOf(templateId),
          busy: busySubjects(templateId),
        };
        // A number asked for is looked for among all that is due; else a
        // batch is the check's own.
        const due = await source.due(count ? { ...input, whole: true } : input);
        const room = ANSWER_ROOM - source.brief([]).length;
        const given = fitting(due, room, count);
        const held = db.transaction((tx) =>
          own.live()
            ? holdBatch(tx, schema, templateId, own.sessionUuid, given)
            : [],
        );
        if (!held.length)
          return toolResult(
            'Nothing of that is due: the check has looked at all of it as it reads now.',
          );
        const left = due.length - held.length;
        return toolResult(
          [
            source.brief(held),
            left > 0
              ? `(${left} more of that ${left === 1 ? 'is' : 'are'} due after this batch.)`
              : '(That is all of it that is due.)',
          ].join('\n\n'),
        );
      }),
  );
}

/**
 * How much of a tool's answer a batch may fill: what is beyond the answer's
 * cap would be cut off while still counted as looked at.
 */
const ANSWER_ROOM = 28_000;

/**
 * What of what is due fits one answer, in order, at most `count` of it;
 * always at least one, which is cut short rather than never given.
 */
function fitting(
  due: readonly CheckItem[],
  room: number,
  count: number | undefined,
): CheckItem[] {
  const given: CheckItem[] = [];
  let used = 0;
  for (const item of due) {
    if (count !== undefined && given.length >= count) break;
    const size = item.shown.length + 2;
    if (given.length && used + size > room) break;
    given.push(item);
    used += size;
  }
  return given;
}
