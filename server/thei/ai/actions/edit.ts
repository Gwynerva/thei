import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import {
  AI_EDITABLE_KINDS,
  withActionTexts,
} from '#layers/thei/shared/ai-action-texts';
import type { AiActionKind } from '#layers/thei/shared/ai-actions';
import type { RelationNote } from '#layers/thei/shared/relation';
import { refuse as fail } from '../../entity-patch/text';
import { publishActions } from '../sessions/bus';
import { refreshSessionCounts } from '../sessions/store';
import { coverApplied } from '../templates/coverage';
import { evaluateAction } from './apply';
import { actionDef } from './registry';
import { findActions, inArchivedSession, targetOf } from './rows';
import { sameValue } from './values';

/**
 * The owner corrects a proposal's words: before applying it, in its card —
 * the proposal is then checked again as the model's was, and applied as it
 * stands — or after taking it into a form, by saving the form with other
 * words, which the proposal then counts as applied with. Either way the
 * model's own words are kept beside the owner's (`proposed`), and the
 * proposal stays known by them: what the owner declined or corrected is
 * not proposed again.
 */

/** How long a corrected text may be; each kind keeps its own limit too. */
const WORDS_MAX = 20_000;

/** The owner's words by text key, as a request brings them. */
function wordsOf(values: unknown): Record<string, string> {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    fail('Say which words are corrected, and how.');
  const words: Record<string, string> = {};
  for (const [key, value] of Object.entries(values as Record<string, unknown>))
    if (typeof value === 'string' && key.length <= 100)
      words[key] = value.slice(0, WORDS_MAX);
  return words;
}

/** What a proposer would hand in for a proposal as it is kept. */
export function proposalInputOf(
  kind: string,
  payload: Record<string, unknown>,
) {
  const { kind: _kind, ...input } = payload;
  if (kind === 'relation') {
    const note = input.note as RelationNote | undefined;
    delete input.note;
    if (note?.type === 'split')
      input.notes = { this: note.currentText, other: note.relatedText };
    else if (note) input.note = note.text ?? null;
  }
  return input;
}

function zodProblem(error: z.ZodError) {
  return error.issues
    .map((issue) =>
      issue.path.length
        ? `${issue.path.map(String).join('.')}: ${issue.message}`
        : issue.message,
    )
    .join('; ');
}

/**
 * Lays the owner's words into a proposal still waiting, and checks it as a
 * model's proposal is checked: what does not hold is refused, the words
 * the entity holds already too. Words back to the model's own drop the
 * correction.
 */
export async function editAction(
  actionUuid: string,
  values: unknown,
): Promise<void> {
  const row =
    findActions([actionUuid])[0] ?? fail(`There is no action ${actionUuid}.`);
  if (row.state !== 'pending')
    fail('It is decided already: its words stay as they are.');
  if (inArchivedSession([row]))
    fail('The session is archived: bring it back to change anything in it.');
  if (!AI_EDITABLE_KINDS.has(row.kind as AiActionKind))
    fail('The words of this proposal are not corrected here.');
  const words = wordsOf(values);
  const def = actionDef(row.kind as AiActionKind);
  const edited = withActionTexts(row.kind, row.payload, words);
  const parsed = def.schema.safeParse(proposalInputOf(row.kind, edited));
  if (!parsed.success) fail(zodProblem(parsed.error));
  const prepared = await def.prepare(targetOf(row) as never, parsed.data, {
    reason: row.reason,
    sources: [],
  });
  const proposed = row.proposed ?? row.payload;
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiActions)
    .set({
      payload: prepared.payload,
      base: prepared.base,
      assetUuids: prepared.assetUuids ?? [],
      proposed: sameValue(prepared.payload, proposed) ? null : proposed,
    })
    .where(
      and(
        eq(schema.aiActions.actionUuid, row.actionUuid),
        eq(schema.aiActions.state, 'pending'),
      ),
    )
    .run();
  publishActions([row]);
}

/**
 * A proposal taken into a form, the form saved with the owner's words in
 * place of the model's: it counts as applied, by the owner, with those
 * words — read from what was saved, never taken on trust: laid into the
 * proposal, they must read as done. One the save already left reading as
 * proposed, or as before, is left to settle as any other.
 */
export async function adoptTaken(
  actionUuid: string,
  values: unknown,
  now = Date.now(),
): Promise<void> {
  const row = findActions([actionUuid])[0];
  if (!row || !AI_EDITABLE_KINDS.has(row.kind as AiActionKind)) return;
  if (row.state !== 'pending' && row.state !== 'stale') return;
  if (inArchivedSession([row])) return;
  const edited = withActionTexts(row.kind, row.payload, wordsOf(values));
  if (sameValue(edited, row.payload)) return;
  // Reading as before, it was changed back by hand: it waits again.
  if ((await evaluateAction(row)).state === 'open') return;
  const evaluation = await evaluateAction({ ...row, payload: edited });
  if (evaluation.state !== 'done') return;
  const { db, schema } = THEI_SERVER.useDb();
  const adopted = db.transaction((tx) => {
    const changed = tx
      .update(schema.aiActions)
      .set({
        state: 'applied',
        appliedBy: 'owner',
        decidedAt: now,
        payload: edited,
        proposed: row.proposed ?? row.payload,
      })
      .where(
        and(
          eq(schema.aiActions.actionUuid, row.actionUuid),
          inArray(schema.aiActions.state, ['pending', 'stale']),
        ),
      )
      .run();
    if (changed.changes) refreshSessionCounts(tx, schema, row.sessionUuid);
    return changed.changes > 0;
  });
  if (!adopted) return;
  publishActions([row]);
  coverApplied([row.actionUuid]);
}
