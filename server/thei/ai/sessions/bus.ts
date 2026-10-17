/**
 * What happens in a session, told to whoever watches it: an open page of the
 * owner's, through its event stream. The database stays the truth; these
 * only say what to read again — and carry a model's words as it writes them,
 * which are saved now and then rather than on every word.
 */
export type SessionSignal =
  /**
   * Words a model has just written, to add to its message: `at` is how long
   * its words were before them, so a page that has some already takes only
   * the rest, and one that missed some knows to read the message again.
   */
  | { type: 'delta'; messageUuid: string; text: string; at: number }
  /** A message was added, or its words or parts changed. */
  | { type: 'message'; messageUuid: string }
  /** Actions were proposed, or decided. */
  | { type: 'actions'; actionUuids: string[] }
  /** The session itself: its state, its counts, its title. */
  | { type: 'session' };

type Listener = (signal: SessionSignal) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeSession(
  sessionUuid: string,
  listener: Listener,
): () => void {
  let set = listeners.get(sessionUuid);
  if (!set) listeners.set(sessionUuid, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (!set!.size) listeners.delete(sessionUuid);
  };
}

export function publishSession(sessionUuid: string, signal: SessionSignal) {
  for (const listener of listeners.get(sessionUuid) ?? []) {
    try {
      listener(signal);
    } catch (error) {
      THEI_SERVER.console.error('[AI] A session listener failed:', error);
    }
  }
}

/** Tells every session concerned that these actions changed. */
export function publishActions(
  rows: readonly { sessionUuid: string; actionUuid: string }[],
) {
  const bySession = new Map<string, string[]>();
  for (const row of rows) {
    const ids = bySession.get(row.sessionUuid) ?? [];
    ids.push(row.actionUuid);
    bySession.set(row.sessionUuid, ids);
  }
  for (const [sessionUuid, actionUuids] of bySession) {
    publishSession(sessionUuid, { type: 'actions', actionUuids });
    publishSession(sessionUuid, { type: 'session' });
  }
}

/**
 * The words of each message a model is writing now, ahead of what is saved.
 * A page that comes in between two saves reads them from here, so that what
 * it is given and the words still to come meet exactly.
 */
const writing = new Map<string, string>();

/** The words written so far, or `null` once all of them are saved. */
export function setWriting(messageUuid: string, text: string | null) {
  if (text === null) writing.delete(messageUuid);
  else writing.set(messageUuid, text);
}

export function writingOf(messageUuid: string): string | undefined {
  return writing.get(messageUuid);
}
