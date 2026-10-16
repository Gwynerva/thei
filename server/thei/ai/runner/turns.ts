/**
 * Which turn of each session is alive. A turn can be stopped while it waits
 * on a tool or on the model's service, and what it gets after that comes too
 * late: nothing it would write may land. Every write a turn makes — a
 * proposal, a file, a name, a digest — asks here first, by the session and
 * the message the turn writes, so a turn closed for it, or one a later turn
 * replaced, writes nothing.
 *
 * A leaf: nothing here imports the runner, the tools or the sessions.
 */

const live = new Map<string, string>();

/** A turn of a session begins, writing `messageUuid`. */
export function beginTurn(sessionUuid: string, messageUuid: string) {
  live.set(sessionUuid, messageUuid);
}

/** The turn is over: whatever it still gets is dropped. */
export function endTurn(sessionUuid: string, messageUuid: string) {
  if (live.get(sessionUuid) === messageUuid) live.delete(sessionUuid);
}

/** Whether the turn writing `messageUuid` may still write. */
export function turnLive(sessionUuid: string, messageUuid: string): boolean {
  return live.get(sessionUuid) === messageUuid;
}

/** How long a turn and its parts may take; tests set their own. */
export const TURN_LIMITS = {
  /** How long a stopped turn has to end itself before it is closed for it. */
  graceMs: 5_000,
  /** How long one turn may take in all. */
  turnMs: 15 * 60_000,
  /** How long one tool call may take, and the overview and files read first. */
  toolMs: 60_000,
  /** How long the model's service may say nothing while it answers. */
  silenceMs: 120_000,
};

/** Why a turn's signal was aborted: the owner stopped it, or its time ran out. */
export type TurnHalt = 'stopped' | 'timeout';

/** What stopped a turn whose signal was aborted. */
export function haltOf(signal: AbortSignal): TurnHalt {
  return signal.reason === 'timeout' ? 'timeout' : 'stopped';
}

/** Something waited on longer than it may take. */
export class TookTooLong extends Error {
  constructor(readonly ms: number) {
    super(`It took longer than ${Math.round(ms / 1000)} s.`);
    this.name = 'TookTooLong';
  }
}

/**
 * `promise`, unless `signal` aborts or `ms` pass first: then it rejects —
 * with the signal's reason, or `TookTooLong`. What it waited on goes on
 * unwatched, and whatever it brings is dropped.
 */
export function within<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
): Promise<T> {
  // A rejection that comes after it was left is nobody's to hear.
  promise.catch(() => {});
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
    };
    const aborted = () => {
      done();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      done();
      reject(new TookTooLong(ms));
    }, ms);
    timer.unref?.();
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(
      (value) => {
        done();
        resolve(value);
      },
      (error: unknown) => {
        done();
        reject(error);
      },
    );
  });
}
