import { applyActions, type ApplyOutcome } from '../ai/actions/apply';
import {
  proposeActions,
  type ActionProposal,
  type ProposeResult,
} from '../ai/actions/propose';
import { findActions } from '../ai/actions/rows';
import type {
  ActionRow,
  PartDecisions,
  PartStateRow,
} from '../ai/actions/types';
import { deleteSession } from '../ai/sessions/lifecycle';
import { createSession } from '../ai/sessions/store';
import { markContentWriteRequest } from '../read-only-request';
import type { McpCallContext } from './context';

/**
 * What an app with an editor's key changes, it changes at once, as the owner
 * would in the admin: the owner asked for it in the app's own conversation,
 * and that conversation is where the work is followed and agreed. Thei keeps
 * no copy of it — no session, no journal, nothing to decide or undo here.
 *
 * The change goes the way the site's model's actions go when the owner
 * applies them — checked against the archive, read from its form, laid over
 * it and saved back with the version it read, a bundle whole or not at all —
 * so those actions are made for the call alone, in a container of its own
 * (`origin: 'app'`, listed nowhere), and deleted with it once they are
 * applied. Deleting them lets go of what they held for an undo; a text keeps
 * the version before them in its history, as after a save of the owner's.
 * A container a crash left behind is swept by `sweepAppContainers`.
 *
 * Every part of a text edit is taken, sure or not: the app's word is the
 * owner's. A remark, which changes no words, is left out when it is checked.
 */

export interface DirectWrite {
  actions: ActionProposal[];
  atomic?: boolean;
  sources?: string[];
}

export interface DirectOutcome {
  results: ProposeResult[];
  applied?: ApplyOutcome;
  /**
   * Of an action applied in parts, the parts that did not land, each a
   * sentence for the app, by action.
   */
  unmade?: Record<string, string[]>;
}

export async function applyDirect(
  context: McpCallContext,
  write: DirectWrite,
): Promise<DirectOutcome> {
  const sessionUuid = createSession({ origin: 'app' });
  try {
    const { results } = await proposeActions({
      sessionUuid,
      actions: write.actions,
      atomic: write.atomic,
      sources: write.sources,
      direct: true,
    });
    const accepted = results.flatMap((result) =>
      'actionUuid' in result ? [result.actionUuid] : [],
    );
    if (!accepted.length) return { results };
    const applied = await applyActions({
      actionUuids: accepted,
      by: 'app',
      parts: everyPart(findActions(accepted)),
    });
    if (applied.applied.length) markContentWriteRequest(context.event);
    const unmade = Object.fromEntries(
      findActions(applied.applied.map((item) => item.actionUuid)).flatMap(
        (row) => {
          const notes = partsNotMade(row);
          return notes.length ? [[row.actionUuid, notes]] : [];
        },
      ),
    );
    return { results, applied, unmade };
  } finally {
    deleteSession(sessionUuid);
  }
}

/** Every part of each action, taken. */
function everyPart(rows: ActionRow[]): Record<string, PartDecisions> {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const parts = (row.parts ?? []) as PartStateRow[];
      return parts.length
        ? [
            [
              row.actionUuid,
              Object.fromEntries(
                parts.map((part) => [part.id, 'accepted' as const]),
              ),
            ],
          ]
        : [];
    }),
  );
}

/** The parts of an applied action that did not land, and why. */
function partsNotMade(row: ActionRow): string[] {
  const described = new Map(
    (
      ((row.payload as { parts?: unknown }).parts ?? []) as {
        id: string;
        type: string;
        find?: string;
        words?: string;
        quote?: string;
      }[]
    ).map((part) => [part.id, part]),
  );
  return ((row.parts ?? []) as PartStateRow[]).flatMap((state) => {
    if (state.state === 'applied') return [];
    const part = described.get(state.id);
    const words = part?.find ?? part?.words ?? part?.quote;
    return [
      `${words ? `"${words}"` : (part?.type ?? state.id)}: ${state.problem ?? 'not made.'}`,
    ];
  });
}
