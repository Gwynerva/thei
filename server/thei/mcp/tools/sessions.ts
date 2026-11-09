import type { McpServer } from '@modelcontextprotocol/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AI_ACTION_INFO,
  AI_ACTION_KINDS,
} from '#layers/thei/shared/ai-actions';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { proposeActions } from '../../ai/actions/propose';
import { AI_ACTION_DEFS, actionDef } from '../../ai/actions/registry';
import { findAction, sessionActions, targetOf } from '../../ai/actions/rows';
import { targetRef } from '../../ai/actions/target';
import type { PartStateRow } from '../../ai/actions/types';
import { FORM_REFERENCE } from '../../ai/forms/changes';
import { findEntity, refOf } from '../../entity-kinds';
import { findSession } from '../../ai/sessions/store';
import { CHANGES, READS, SUGGESTS } from '../annotations';
import type { McpCallContext } from '../context';
import { applyDirect } from '../direct';
import { guardTool, REFUSED_META, toolResult } from '../result';
import { mayEdit, spendWrite } from '../scope';

/**
 * The actions of the archive, two ways. Thei's own model proposes them in
 * the session it works in, and reads back the owner's word on them. An app
 * with an editor's key applies them at once (`../direct.ts`): the owner
 * agreed to its work in the app's own conversation, so nothing of it waits
 * here; an app with a reader's key changes nothing. An app has no session
 * in Thei.
 */

/** Actions `session_actions` lists, the newest first. */
const ACTIONS_LISTED = 60;

function firstSentence(text: string) {
  const end = text.search(/[.:](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

function actionLine(row: ReturnType<typeof findAction> & {}): string[] {
  const target = targetOf(row);
  const summary = actionDef(row.kind).summary(row.payload as never);
  const lines = [
    `- ${row.actionUuid}: ${row.kind}${target ? ` on ${targetRef(target)}` : ''} — ${summary} — ${row.state}${row.state === 'pending' ? ` (${row.certainty})` : ''}${row.supersedes ? `, replaces ${row.supersedes}` : ''}`,
  ];
  const parts = (row.parts ?? []) as PartStateRow[];
  if (parts.length)
    lines.push(
      `  parts: ${parts.map((part) => `${part.id} ${part.state}${part.problem ? ` (${part.problem})` : ''}`).join(', ')}`,
    );
  // Corrected by the owner: their words stand, the model's are said too.
  if (row.proposed !== null && row.proposed !== undefined)
    lines.push(
      `  corrected by the owner; it proposed: ${actionDef(row.kind).summary(row.proposed as never)}`,
    );
  if (row.error) lines.push(`  error: ${row.error}`);
  return lines;
}

/**
 * The refs of what a call applied, each once, as the archive's tools name
 * them: a diary entry by its day. A deleted one keeps the ref it had.
 */
function appliedRefs(applied: { entity?: string }[]): string {
  const refs = [
    ...new Set(
      applied.flatMap((item) => {
        if (!item.entity) return [];
        const key = item.entity.startsWith('asset:')
          ? undefined
          : findEntity(item.entity);
        return [key ? refOf(key) : item.entity];
      }),
    ),
  ];
  return refs.length ? `: ${refs.join(', ')}` : '';
}

export function registerSessionTools(
  server: McpServer,
  context: McpCallContext,
) {
  const inSession = context.session;
  // An app that only reads has no use for the kinds of action.
  if (!inSession && !mayEdit(context.principal.scopes)) return;

  if (inSession)
    server.registerTool(
      'session_actions',
      {
        title: 'Actions of the session',
        description:
          'What became of what was proposed in this session — waiting, ' +
          'applied, declined, overtaken, undone — with the owner’s comments, ' +
          'each a request for a new version of the action it is on (propose ' +
          'it with supersedes).',
        inputSchema: z.object({}),
        annotations: READS,
      },
      () =>
        guardTool(() => {
          const sessionUuid = inSession.sessionUuid;
          const row = findSession(sessionUuid);
          if (!row) return toolResult('The session is gone.');
          const actions = sessionActions(sessionUuid)
            .slice(-ACTIONS_LISTED)
            .reverse();
          const { db, schema } = THEI_SERVER.useDb();
          const comments = new Map<string, string[]>();
          for (const message of db
            .select({
              text: schema.aiMessages.text,
              parts: schema.aiMessages.parts,
            })
            .from(schema.aiMessages)
            .where(eq(schema.aiMessages.sessionUuid, sessionUuid))
            .orderBy(asc(schema.aiMessages.seq))
            .all() as { text: string; parts: AiMessagePart[] }[])
            for (const part of message.parts)
              if (part.type === 'comment') {
                const list = comments.get(part.actionUuid) ?? [];
                list.push(message.text);
                comments.set(part.actionUuid, list);
              }
          const lines = [
            `# ${sessionUuid}${row.title ? ` — ${row.title}` : ''}`,
            '',
            ...(actions.length
              ? actions.flatMap((action) => [
                  ...actionLine(action),
                  ...(comments.get(action.actionUuid) ?? []).map(
                    (text) => `  owner: ${text.replace(/\s+/g, ' ')}`,
                  ),
                ])
              : ['_(nothing proposed yet)_']),
          ];
          return toolResult(lines.join('\n'));
        }),
    );

  server.registerTool(
    'describe_actions',
    {
      title: 'Describe actions',
      description: inSession
        ? 'The kinds of action you may propose, and, for the kinds named, ' +
          'what each is for and the fields it takes. Read a kind before ' +
          'proposing it.'
        : 'The kinds of action apply_actions takes, and, for the kinds ' +
          'named, what each is for and the fields it takes. Read a kind ' +
          'before applying it.',
      inputSchema: z.object({
        kinds: z.array(z.string()).optional(),
      }),
      annotations: READS,
    },
    ({ kinds }) =>
      guardTool(() => {
        if (!kinds?.length)
          return toolResult(
            [
              'Kinds of action — name the ones you need in kinds to read them in full:',
              '',
              ...AI_ACTION_KINDS.map(
                (kind) =>
                  `- ${kind}${AI_ACTION_INFO[kind].final ? ' (final)' : ''}: ${firstSentence(AI_ACTION_DEFS[kind].reference)}`,
              ),
            ].join('\n'),
          );
        const lines: string[] = [];
        for (const name of kinds) {
          const def = actionDef(name);
          const { $schema: _schema, ...schema } = z.toJSONSchema(def.schema, {
            io: 'input',
          }) as Record<string, unknown>;
          lines.push(
            `## ${def.kind}`,
            '',
            def.reference,
            '',
            // A new entity has no target, but for a part: its owner.
            def.kind === 'create'
              ? 'Target: none, but a new section names its project, and a new excerpt the project, event or diary entry it is a part of.'
              : def.kind === 'describe'
                ? 'Target: the file, named by file (or as target asset:<id>).'
                : `Targets: ${def.targets.join(', ')}.`,
            '',
            `Fields: ${JSON.stringify(schema)}`,
            '',
          );
          if (def.kind === 'update' || def.kind === 'create')
            lines.push(FORM_REFERENCE, '');
        }
        lines.push(
          inSession
            ? 'Every action also takes target (a ref), reason (why, for the owner), certainty (sure: the owner can take it at a glance; unsure: theirs to judge, and the reason says what to weigh) and supersedes (an action of the session this one is a new version of).'
            : 'Every action also takes target (a ref). What the owner asked you for in your conversation is their consent, and the rules above that leave a change to the owner are met by it: a text written anew, a project made and filled, parts of an entry made excerpts, an entity deleted.',
        );
        return toolResult(lines.join('\n'));
      }),
  );

  const actionsInput = z
    .array(
      z.looseObject({
        kind: z.string(),
        target: z.string().optional(),
        certainty: z.enum(['sure', 'unsure']).optional(),
        reason: z.string().optional(),
        supersedes: z.string().optional(),
      }),
    )
    .min(1)
    .max(50);
  const sourcesInput = z
    .array(z.string())
    .max(100)
    .optional()
    .describe('The refs you read to come to it');

  if (!inSession) {
    server.registerTool(
      'apply_actions',
      {
        title: 'Apply actions',
        description:
          'Changes the archive at once, as the owner would in the admin: a ' +
          'field set, tags, a relation, a text written or edited, a new ' +
          'entity, a deletion… Applied together they are a bundle, in order; ' +
          'an atomic one is applied whole or not at all, and a bundle that ' +
          'fails midway is taken back. Each is checked against the archive ' +
          'and refused with why when it does not hold — read a form changed ' +
          'since you read it again. Every part of a text edit is made, sure ' +
          'or not; a remark with no rewording changes nothing and is left ' +
          'out — say it to the owner. Nothing is kept to undo: a text keeps ' +
          'its earlier version in its history, but a deletion is final.',
        inputSchema: z.object({
          actions: actionsInput,
          atomic: z.boolean().optional(),
          sources: sourcesInput,
        }),
        annotations: CHANGES,
      },
      ({ actions, atomic, sources }) =>
        guardTool(async () => {
          spendWrite(context);
          const { results, applied, unmade } = await applyDirect(context, {
            actions: actions as never,
            atomic,
            sources,
          });
          const kindOf = (actionUuid: string) => {
            const index = results.findIndex(
              (result) =>
                'actionUuid' in result && result.actionUuid === actionUuid,
            );
            return actions[index]?.kind ?? 'an action';
          };
          const refused = results.flatMap((result, index) =>
            'refused' in result
              ? [`- ${actions[index]!.kind}: refused — ${result.refused}`]
              : [],
          );
          const lines = [
            !applied
              ? 'Nothing was applied.'
              : applied.refused
                ? `Not applied: ${applied.refused}`
                : applied.failed
                  ? `Not applied: ${kindOf(applied.failed.actionUuid)} failed — ${applied.failed.error}`
                  : `Applied ${applied.applied.length}${appliedRefs(applied.applied)}.`,
            ...refused,
            ...results.flatMap((result, index) =>
              'actionUuid' in result
                ? result.dropped.map(
                    (note) => `- ${actions[index]!.kind}: left out — ${note}`,
                  )
                : [],
            ),
            ...Object.entries(unmade ?? {}).flatMap(([actionUuid, notes]) =>
              notes.map(
                (note) => `- ${kindOf(actionUuid)}: not made — ${note}`,
              ),
            ),
          ];
          return {
            ...toolResult(lines.join('\n')),
            _meta: { [REFUSED_META]: refused.length },
          };
        }),
    );
    return;
  }

  server.registerTool(
    'propose',
    {
      title: 'Propose actions',
      description:
        'Proposes actions to the owner: a field set, tags, a relation, a ' +
        'text edit, a new entity… Proposed together they are a bundle, ' +
        'shown and applied in order; an atomic one is applied whole or not ' +
        'at all. Alternatives for one thing — two values of a field — go in ' +
        'calls of their own. Each is checked against the archive now and refused with ' +
        'why when it does not hold, or when the owner already declined it. ' +
        'Nothing changes until the owner applies one.',
      inputSchema: z.object({
        actions: actionsInput,
        atomic: z.boolean().optional(),
        sources: sourcesInput,
      }),
      annotations: SUGGESTS,
    },
    ({ actions, atomic, sources }, ctx) =>
      guardTool(async () => {
        // Proposals fill the owner's page: they are spent as writes.
        spendWrite(context);
        const sessionUuid = inSession.sessionUuid;
        const { results, bundleUuid } = await proposeActions({
          sessionUuid,
          messageUuid: inSession.messageUuid,
          actions: actions as never,
          atomic,
          sources,
          // A call left for taking too long proposes nothing either.
          live: () => inSession.live() && !ctx.mcpReq.signal.aborted,
        });
        const lines = [
          `In session ${sessionUuid}${bundleUuid ? `, as one bundle${atomic ? ' (atomic)' : ''}` : ''}:`,
          ...results.flatMap((result, index) =>
            'refused' in result
              ? [`- ${actions[index]!.kind}: refused — ${result.refused}`]
              : [
                  `- ${result.actionUuid}: proposed`,
                  ...result.dropped.map((note) => `  left out: ${note}`),
                ],
          ),
        ];
        const proposed = results.filter((result) => 'actionUuid' in result);
        return {
          ...toolResult(lines.join('\n')),
          _meta: { [REFUSED_META]: results.length - proposed.length },
        };
      }),
  );
}
