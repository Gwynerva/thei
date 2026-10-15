import { desc, eq } from 'drizzle-orm';
import { publishSession } from '../sessions/bus';
import { updateSession } from '../sessions/store';
import { runSessionTurn } from './loop';

/**
 * Turns of sessions waiting for the model, taken a couple at a time outside
 * any request: the owner's message is saved and answered at once, and the
 * page follows the answer as it streams. A turn can be stopped mid-way.
 */

/** How many turns run at once: enough for two sessions, gentle on a laptop's model. */
const AT_ONCE = 2;

const running = new Map<string, AbortController>();
const waiting: string[] = [];
let idle: Promise<void> = Promise.resolve();
let settle: (() => void) | undefined;

function pump() {
  while (running.size < AT_ONCE && waiting.length) {
    const sessionUuid = waiting.shift()!;
    const controller = new AbortController();
    running.set(sessionUuid, controller);
    runSessionTurn(sessionUuid, controller.signal)
      .catch((error) =>
        THEI_SERVER.console.error('[AI] A session turn failed:', error),
      )
      .finally(() => {
        running.delete(sessionUuid);
        // The owner wrote while the model answered: it answers that too,
        // unless the owner stopped it.
        if (!controller.signal.aborted && ownerSpokeLast(sessionUuid))
          waiting.push(sessionUuid);
        pump();
      });
  }
  if (!running.size && !waiting.length && settle) {
    settle();
    settle = undefined;
  }
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
  const controller = running.get(sessionUuid);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** For tests: resolves once no turn runs or waits. */
export function turnsSettled(): Promise<void> {
  return running.size || waiting.length ? idle : Promise.resolve();
}

/**
 * What the last process left half-done is put right at start: a session it
 * was answering is idle again, an action it was applying waits again.
 */
export function recoverAiSessions() {
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiSessions)
    .set({ state: 'idle' })
    .where(eq(schema.aiSessions.state, 'running'))
    .run();
  db.update(schema.aiActions)
    .set({ state: 'pending' })
    .where(eq(schema.aiActions.state, 'applying'))
    .run();
}
