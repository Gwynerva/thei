import type { AiMessagePart } from '#layers/thei/shared/ai';
import { findTarget, type ActionTarget } from '../actions/target';
import { publishSession } from '../sessions/bus';
import {
  findMessage,
  findSession,
  sessionMessages,
  updateMessage,
} from '../sessions/store';
import { busySubjects, coverageOf, coveredCount, lastAsked } from './coverage';
import { TEMPLATE_SOURCES } from './sources';
import { findTemplate } from './store';

/**
 * A check that has more to look at says so under its answer — «N more», or
 * «go on» while whole batches remain — and goes on when the owner asks:
 * never by itself, since every batch is the owner's money.
 */

type ContinuePart = Extract<AiMessagePart, { type: 'continue' }>;

/** The built-in check a session runs, and what its run is about. */
function runOf(sessionUuid: string) {
  const session = findSession(sessionUuid);
  if (!session || session.origin !== 'template' || session.archivedAt)
    return undefined;
  const template = session.templateId
    ? findTemplate(session.templateId)
    : undefined;
  const key = template?.builtin;
  if (!template || !key) return undefined;
  const part = sessionMessages(sessionUuid)
    .flatMap((message) => message.parts as AiMessagePart[])
    .find(
      (item): item is Extract<AiMessagePart, { type: 'template' }> =>
        item.type === 'template',
    );
  return { session, template, key, scope: part?.scope };
}

/**
 * What the run would be given next, as its model last asked for it: how
 * many subjects, and how many it looked at in this session.
 * `null` when nothing is due; `undefined` when the session runs no check.
 */
export async function dueNext(
  sessionUuid: string,
): Promise<Omit<ContinuePart, 'type'> | null | undefined> {
  const run = runOf(sessionUuid);
  if (!run) return undefined;
  const source = TEMPLATE_SOURCES[run.key];
  const ask = lastAsked(sessionUuid);
  const bound = run.scope?.flatMap((ref) => findTarget(ref) ?? []);
  const named = ask?.refs?.flatMap((ref) => findTarget(ref) ?? []);
  const scope: ActionTarget[] | undefined = named?.length ? named : bound;
  // A number the model asked for is what goes on, as far as what is due
  // now reaches: counted among all of it, as `check_batch` looks for it.
  const due = await source.due({
    scope,
    areas: ask?.areas?.length ? new Set(ask.areas) : undefined,
    covered: coverageOf(run.template.templateId),
    busy: busySubjects(run.template.templateId),
    ...(ask?.count ? { whole: true } : {}),
  });
  if (!due.length) return null;
  // How far it is: what this session's runs looked at, counted, never what
  // is left, which would read the whole archive at the end of every turn.
  return {
    next: ask?.count ? Math.min(ask.count, due.length) : due.length,
    looked: coveredCount(run.template.templateId, sessionUuid),
  };
}

/** Takes the offer to go on away: it was taken, or another came. */
export function withdrawContinue(sessionUuid: string) {
  for (const message of sessionMessages(sessionUuid)) {
    const parts = message.parts as AiMessagePart[];
    if (!parts.some((part) => part.type === 'continue')) continue;
    updateMessage(message.messageUuid, {
      parts: parts.filter((part) => part.type !== 'continue'),
    });
    publishSession(sessionUuid, {
      type: 'message',
      messageUuid: message.messageUuid,
    });
  }
}

/**
 * Under the answer of a check's turn that went through, or paused at its
 * limits: whether more is due, offered as one button to go on — or, with
 * nothing left, that all of it was looked at (`next: 0`).
 */
export async function offerToContinue(
  sessionUuid: string,
  messageUuid: string,
) {
  try {
    const due = await dueNext(sessionUuid);
    if (due === undefined) return;
    const next = due ?? { next: 0, looked: 0 };
    const message = findMessage(messageUuid);
    // A question waits for its answer first.
    if (
      !message ||
      (message.parts as AiMessagePart[]).some(
        (part) => part.type === 'question',
      )
    )
      return;
    withdrawContinue(sessionUuid);
    updateMessage(messageUuid, {
      parts: [
        ...(message.parts as AiMessagePart[]).filter(
          (part) => part.type !== 'continue',
        ),
        { type: 'continue', ...next },
      ],
    });
    publishSession(sessionUuid, { type: 'message', messageUuid });
  } catch (error) {
    THEI_SERVER.console
      .tag('AI')
      .warn(
        `Could not tell whether a check has more to look at: ${String(error)}`,
      );
  }
}
