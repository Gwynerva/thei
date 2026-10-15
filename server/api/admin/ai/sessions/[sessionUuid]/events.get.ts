import { requireAiOn } from '../../../../../thei/ai-on';
import {
  subscribeSession,
  type SessionSignal,
} from '../../../../../thei/ai/sessions/bus';
import {
  actionsById,
  messageById,
  sessionDetail,
  sessionHead,
} from '../../../../../thei/ai/sessions/view';

/** A beat now and then, so a proxy never takes a quiet stream for a dead one. */
const HEARTBEAT_MS = 15_000;

/**
 * A session as it happens, for the page that shows it: first the session as
 * it stands (after the message the page has, with `after`), then what
 * changes — the model's words as it writes them, messages, actions, the
 * session itself. The database stays the truth: each change is read from it.
 */
export default defineEventHandler(async (event) => {
  requireAiOn();
  const sessionUuid = getRouterParam(event, 'sessionUuid') ?? '';
  const after = Number(getQuery(event).after);

  // Changes are heard from before the session is read, so none falls between
  // the two; words heard twice are told apart by where they stand.
  const early: SessionSignal[] = [];
  let forward: ((signal: SessionSignal) => void) | undefined;
  const unsubscribe = subscribeSession(sessionUuid, (signal) =>
    forward ? forward(signal) : early.push(signal),
  );
  const snapshot = await sessionDetail(
    sessionUuid,
    Number.isFinite(after) && after > 0 ? after : 0,
  ).catch((error) => {
    unsubscribe();
    throw error;
  });
  if (!snapshot) {
    unsubscribe();
    throw createError({ statusCode: 404 });
  }

  setResponseHeaders(event, {
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  const stream = createEventStream(event);
  const send = (name: string, data: unknown) =>
    stream.push({ event: name, data: JSON.stringify(data) }).catch(() => {});

  // The session as it stands goes first, then the changes in the order they
  // happened, each read when its turn comes. Nothing is awaited before the
  // stream is handed over: a push waits until the page reads.
  let chain: Promise<void> = send('snapshot', snapshot);
  forward = (signal: SessionSignal) => {
    chain = chain.then(async () => {
      switch (signal.type) {
        case 'delta':
          await send('delta', {
            messageUuid: signal.messageUuid,
            text: signal.text,
            at: signal.at,
          });
          return;
        case 'message': {
          const message = messageById(signal.messageUuid);
          if (message) await send('message', message);
          return;
        }
        case 'actions':
          await send('actions', await actionsById(signal.actionUuids));
          return;
        case 'session': {
          const head = sessionHead(sessionUuid);
          await send('session', head ?? { deleted: true });
          return;
        }
      }
    });
  };
  for (const signal of early.splice(0)) forward(signal);
  const heartbeat = setInterval(() => {
    stream.push({ event: 'ping', data: '' }).catch(() => {});
  }, HEARTBEAT_MS);
  stream.onClosed(() => {
    unsubscribe();
    clearInterval(heartbeat);
  });
  return stream.send();
});
