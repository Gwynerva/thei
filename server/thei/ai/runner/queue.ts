import type { AiMessagePart, AiTranscriptTurn } from '#layers/thei/shared/ai';
import { desc, eq } from 'drizzle-orm';
import { cancelFileJobs } from '../../mcp/file-jobs';
import { publishSession } from '../sessions/bus';
import {
  sessionMessages,
  updateMessage,
  updateSession,
} from '../sessions/store';
import { runSessionTurn, type TurnHandle } from './loop';
import { repairTranscript } from './transcript';
import { TURN_LIMITS, type TurnHalt } from './turns';

/**
 * Turns of sessions waiting for the model, taken a couple at a time outside
 * any request: the owner's message is saved and answered at once, and the
 * page follows the answer as it streams. A turn can be stopped mid-way, and
 * stops for sure: one that does not end when told — a tool that hangs, a
 * service that never answers — is closed for it a few seconds later, and
 * one that runs too long is stopped on its own.
 */

/** How many turns run at once: enough for two sessions, gentle on a laptop's model. */
const AT_ONCE = 2;

interface Running {
  controller: AbortController;
  /** The turn's own way to be closed, once it has begun. */
  handle: TurnHandle;
  /** Over: ended by itself, or closed for it. */
  settled: boolean;
  /** The turn's clock, and the grace a stopped turn has to end itself. */
  clock?: ReturnType<typeof setTimeout>;
  grace?: ReturnType<typeof setTimeout>;
}

const running = new Map<string, Running>();
const waiting: string[] = [];
let idle: Promise<void> = Promise.resolve();
let settle: (() => void) | undefined;

function pump() {
  while (running.size < AT_ONCE && waiting.length) {
    const sessionUuid = waiting.shift()!;
    const turn: Running = {
      controller: new AbortController(),
      handle: {},
      settled: false,
    };
    running.set(sessionUuid, turn);
    turn.clock = setTimeout(
      () => halt(sessionUuid, turn, 'timeout'),
      TURN_LIMITS.turnMs,
    );
    turn.clock.unref?.();
    runSessionTurn(sessionUuid, turn.controller.signal, turn.handle)
      .catch((error) =>
        THEI_SERVER.console.error('[AI] A session turn failed:', error),
      )
      .finally(() => settled(sessionUuid, turn));
  }
  if (!running.size && !waiting.length && settle) {
    settle();
    settle = undefined;
  }
}

/** A turn is over: its slot goes to the next. */
function settled(sessionUuid: string, turn: Running) {
  if (turn.settled) return;
  turn.settled = true;
  clearTimeout(turn.clock);
  clearTimeout(turn.grace);
  if (running.get(sessionUuid) === turn) running.delete(sessionUuid);
  // The owner wrote while the model answered: it answers that too, unless
  // it was stopped.
  if (!turn.controller.signal.aborted && ownerSpokeLast(sessionUuid))
    waiting.push(sessionUuid);
  pump();
}

/**
 * Tells a turn to stop, and closes it for it if it has not ended within the
 * grace: what it wrote stays, put right for the conversation to go on.
 */
function halt(sessionUuid: string, turn: Running, why: TurnHalt) {
  if (turn.settled || turn.controller.signal.aborted) return;
  turn.controller.abort(why);
  turn.grace = setTimeout(() => {
    if (turn.settled) return;
    THEI_SERVER.console.warn(
      '[AI] A turn did not end when stopped; it was closed for it.',
    );
    try {
      if (turn.handle.close) turn.handle.close(why);
      else {
        updateSession(sessionUuid, { state: 'idle' });
        publishSession(sessionUuid, { type: 'session' });
      }
    } catch (error) {
      THEI_SERVER.console.error('[AI] Closing a turn failed:', error);
    }
    settled(sessionUuid, turn);
  }, TURN_LIMITS.graceMs);
  turn.grace.unref?.();
}

/** Whether the newest message of a session is the owner's. */
function ownerSpokeLast(sessionUuid: string): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select({ role: schema.aiMessages.role })
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.sessionUuid, sessionUuid))
      .orderBy(desc(schema.aiMessages.seq))
      .get()?.role === 'owner'
  );
}

/** Has the model answer a session, after what is waiting before it. */
export function startTurn(sessionUuid: string) {
  if (running.has(sessionUuid) || waiting.includes(sessionUuid)) return;
  if (!settle) idle = new Promise((resolve) => (settle = resolve));
  waiting.push(sessionUuid);
  // Shown as answering from the moment it is asked.
  updateSession(sessionUuid, { state: 'running' });
  publishSession(sessionUuid, { type: 'session' });
  pump();
}

/** Stops a session's turn: what was written stays, with a note it was stopped. */
export function stopTurn(sessionUuid: string): boolean {
  const index = waiting.indexOf(sessionUuid);
  if (index !== -1) {
    waiting.splice(index, 1);
    updateSession(sessionUuid, { state: 'idle' });
    publishSession(sessionUuid, { type: 'session' });
    pump();
    return true;
  }
  const turn = running.get(sessionUuid);
  if (!turn) return false;
  halt(sessionUuid, turn, 'stopped');
  return true;
}

/**
 * Stops everything the model and the apps have under way: turns waiting and
 * running, and files on their way. AI turned off leaves nothing working.
 */
export function stopAllTurns() {
  for (const sessionUuid of [...waiting]) stopTurn(sessionUuid);
  for (const sessionUuid of [...running.keys()]) stopTurn(sessionUuid);
  cancelFileJobs();
}

/** For tests: resolves once no turn runs or waits. */
export function turnsSettled(): Promise<void> {
  return running.size || waiting.length ? idle : Promise.resolve();
}

/**
 * Whether an answer was cut off midway: it ended neither with words alone,
 * nor with a question to the owner, nor with a notice of why it stopped.
 */
function cutOff(parts: AiMessagePart[], transcript: AiTranscriptTurn[]) {
  if (parts.some((part) => part.type === 'notice' || part.type === 'question'))
    return false;
  const last = transcript.at(-1);
  return last?.role !== 'assistant' || Boolean(last.calls?.length);
}

/**
 * What the last process left half-done is put right at start: a session it
 * was answering is idle again, an answer it cut off is made whole for the
 * conversation to go on and says it was cut off; an action it was applying
 * waits again, and what checks' runs were given is let go — no turn of the
 * last process goes on.
 */
export function recoverAiSessions() {
  const { db, schema } = THEI_SERVER.useDb();
  const answering = db
    .select({ sessionUuid: schema.aiSessions.sessionUuid })
    .from(schema.aiSessions)
    .where(eq(schema.aiSessions.state, 'running'))
    .all() as { sessionUuid: string }[];
  for (const { sessionUuid } of answering) {
    const last = sessionMessages(sessionUuid)
      .filter((message) => message.role === 'model')
      .at(-1);
    const parts = (last?.parts ?? []) as AiMessagePart[];
    // A session only waiting for its turn was cut off in nothing.
    if (!last || !cutOff(parts, last.transcript)) continue;
    updateMessage(last.messageUuid, {
      transcript: repairTranscript(last.transcript),
      parts: [...parts, { type: 'notice', kind: 'interrupted', text: '' }],
    });
  }
  db.update(schema.aiSessions)
    .set({ state: 'idle' })
    .where(eq(schema.aiSessions.state, 'running'))
    .run();
  db.update(schema.aiActions)
    .set({ state: 'pending' })
    .where(eq(schema.aiActions.state, 'applying'))
    .run();
  db.delete(schema.aiTemplateBatches).run();
}
