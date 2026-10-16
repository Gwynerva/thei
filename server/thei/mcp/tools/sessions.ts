import type { McpServer } from '@modelcontextprotocol/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AI_ACTION_INFO,
  AI_ACTION_KINDS,
} from '#layers/thei/shared/ai-actions';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { applyActions } from '../../ai/actions/apply';
import { proposeActions } from '../../ai/actions/propose';
import { AI_ACTION_DEFS, actionDef } from '../../ai/actions/registry';
import { findAction, sessionActions, targetOf } from '../../ai/actions/rows';
import { targetRef } from '../../ai/actions/target';
import { undoActionHeld } from '../../ai/actions/undo';
import type { PartStateRow } from '../../ai/actions/types';
import { FORM_REFERENCE } from '../../ai/forms/changes';
import {
  latestAppSession,
  openAppSession,
  readableSession,
  sessionForCall,
} from '../../ai/sessions/app';
import { findSession } from '../../ai/sessions/store';
import { markContentWriteRequest } from '../../read-only-request';
import { ADDS, CHANGES, READS, SUGGESTS } from '../annotations';
import type { McpCallContext } from '../context';
import { guardTool, McpToolError, REFUSED_META, toolResult } from '../result';
import { mayEdit, requireScope, spendWrite } from '../scope';

/**
 * Sessions and the actions proposed in them: what an app proposes, applies
 * with an editor's key, reads back the owner's word on, and takes back.
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
  if (row.error) lines.push(`  error: ${row.error}`);
  return lines;
}

export function registerSessionTools(
  server: McpServer,
  context: McpCallContext,
) {
  // Thei's own model works in the session it was started in.
  if (!context.session)
    server.registerTool(
      'open_session',
      {
        title: 'Open a session',
        description:
          'Starts a session of your own for a piece of work: what you ' +
          'propose in it is shown to the owner together, under its title. ' +
          'Without one, what you propose is gathered by your key and name, a ' +
          'new session after half an hour of quiet.',
        inputSchema: z.object({
          title: z
            .string()
            .max(200)
            .describe('A few words on what the work is, for the owner'),
        }),
        annotations: ADDS,
      },
      ({ title }) =>
        guardTool(() => {
          spendWrite(context);
          const sessionUuid = openAppSession(context, title);
          return toolResult(
            {},
            `Opened ${sessionUuid}. Name it as session in propose and session_actions.`,
          );
        }),
    );

  server.registerTool(
    'session_actions',
    {
      title: 'Actions of a session',
      description:
        'What became of what was proposed in a session — waiting, applied, ' +
        'declined, overtaken, undone — with the owner’s comments, each a ' +
        'request for a new version of the action it is on (propose it with ' +
        'supersedes). Without session, your latest.',
      inputSchema: z.object({
        session: z.string().optional(),
      }),
      annotations: READS,
    },
    ({ session }) =>
      guardTool(() => {
        const sessionUuid = session ?? latestAppSession(context);
        if (!sessionUuid) return toolResult({}, 'No session yet.');
        if (!readableSession(context, sessionUuid))
          throw new McpToolError(
            `There is no session ${sessionUuid} of this key.`,
          );
        const row = findSession(sessionUuid)!;
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
          `# ${sessionUuid}${row.title ? ` — ${row.title}` : ''}${row.closedAt ? ' (archived by the owner)' : ''}`,
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
        return toolResult({}, lines.join('\n'));
      }),
  );

  server.registerTool(
    'describe_actions',
    {
      title: 'Describe actions',
      description:
        'The kinds of action you may propose, and, for the kinds named, what ' +
        'each is for and the fields it takes. Read a kind before proposing it.',
      inputSchema: z.object({
        kinds: z.array(z.string()).optional(),
      }),
      annotations: READS,
    },
    ({ kinds }) =>
      guardTool(() => {
        if (!kinds?.length)
          return toolResult(
            {},
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
            // A new entity has no target, but for a section: its project.
            def.kind === 'create'
              ? 'Target: none, but a new section names its project.'
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
          'Every action also takes target (a ref), reason (why, for the owner), certainty (sure: the owner can take it at a glance; unsure: theirs to judge, and the reason says what to weigh) and supersedes (an action of the session this one is a new version of).',
        );
        return toolResult({}, lines.join('\n'));
      }),
  );

  const editor = mayEdit(context.principal.scopes);
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
        (editor
          ? 'With apply, your key applies them at once, as the owner would.'
          : 'Nothing changes until the owner applies one.'),
      inputSchema: z.object({
        session: z.string().optional(),
        actions: z
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
          .max(50),
        atomic: z.boolean().optional(),
        sources: z
          .array(z.string())
          .max(100)
          .optional()
          .describe('The refs you read to come to it'),
        ...(editor ? { apply: z.boolean().optional() } : {}),
      }),
      annotations: editor ? CHANGES : SUGGESTS,
    },
    (args) =>
      guardTool(async () => {
        const { session, actions, atomic, sources } = args;
        const apply = (args as { apply?: boolean }).apply === true;
        if (apply) requireScope(context, 'edit', 'apply actions');
        // Proposals fill the owner's page: a key spends its writes on them.
        spendWrite(context);
        const sessionUuid = sessionForCall(context, session);
        const { results, bundleUuid } = await proposeActions({
          sessionUuid,
          messageUuid: context.session?.messageUuid,
          actions: actions as never,
          atomic,
          sources,
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
        const proposed = results.flatMap((result) =>
          'actionUuid' in result ? [result.actionUuid] : [],
        );
        if (apply && proposed.length) {
          const outcome = await applyActions({
            actionUuids: proposed,
            by: 'app',
          });
          if (outcome.applied.length) markContentWriteRequest(context.event);
          lines.push(
            '',
            outcome.refused
              ? `Not applied: ${outcome.refused}`
              : outcome.failed
                ? `Not applied: ${outcome.failed.actionUuid} failed — ${outcome.failed.error}`
                : `Applied: ${outcome.applied.map((item) => `${item.actionUuid}${item.entity ? ` → ${item.entity}` : ''}`).join(', ')}.`,
          );
        }
        return {
          ...toolResult({}, lines.join('\n')),
          _meta: { [REFUSED_META]: results.length - proposed.length },
        };
      }),
  );

  if (editor)
    server.registerTool(
      'undo_action',
      {
        title: 'Undo an action',
        description:
          'Takes back an action applied in a session of yours, while nothing ' +
          'has changed since what it changed: fields put back, a made entity ' +
          'taken back, a text given its earlier wording. A deletion is final.',
        inputSchema: z.object({ action: z.string() }),
        annotations: CHANGES,
      },
      ({ action }) =>
        guardTool(async () => {
          const row = findAction(action);
          const session = row && findSession(row.sessionUuid);
          if (
            !row ||
            !session ||
            session.tokenUuid !== context.principal.tokenUuid
          )
            throw new McpToolError(
              `There is no action ${action} in a session of this key.`,
            );
          requireScope(context, 'edit', 'undo actions');
          const entity = await undoActionHeld(action);
          markContentWriteRequest(context.event);
          return toolResult(
            {},
            `Undone${entity ? `: ${targetRef(entity)} reads as before` : ''}.`,
          );
        }),
    );
}
