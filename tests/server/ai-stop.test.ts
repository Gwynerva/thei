import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  readBody,
  toWebHandler,
} from 'h3';
import type { AiMessagePart, AiTranscriptTurn } from '../../shared/ai';
import type {
  StreamTurnInput,
  StreamTurnOutput,
} from '../../server/thei/ai/model/stream';
import { sessionActions } from '../../server/thei/ai/actions/rows';
import {
  postOwnerMessage,
  startOwnerSession,
} from '../../server/thei/ai/sessions/owner';
import {
  createSession,
  findSession,
  insertMessage,
  sessionMessages,
  updateSession,
} from '../../server/thei/ai/sessions/store';
import {
  recoverAiSessions,
  stopTurn,
  turnsSettled,
} from '../../server/thei/ai/runner/queue';
import { TURN_LIMITS } from '../../server/thei/ai/runner/turns';
import {
  cancelSessionFileJobs,
  runFileJob,
  type FileJob,
} from '../../server/thei/mcp/file-jobs';
import {
  startFakeModel,
  type FakeModel,
  type FakeScript,
} from '../helpers/fake-model';
import {
  aiOnConfig,
  fakeModelSettings,
  freshAiTestDb,
} from '../helpers/fresh-ai-db';

/**
 * A turn stops for sure. Stopped, it ends at once wherever it waits; one
 * that does not end is closed for it, and whatever it gets after that is
 * dropped; one that runs too long, or whose service falls silent, stops on
 * its own. What it leaves is always a conversation that can go on — after a
 * restart too. Turning AI off stops everything, and archiving an app's
 * session cancels the files it still has on their way.
 */

const hooks = vi.hoisted(() => ({
  /** Tools held at their start until the gate opens. */
  gates: new Map<string, Promise<void>>(),
  /** The tools called, in order, as they start. */
  called: [] as string[],
  /** Stands in for the model's service when set. */
  stream: undefined as
    ((input: StreamTurnInput) => Promise<StreamTurnOutput>) | undefined,
  /** What the latest file the model made was told to stop by. */
  fileSignal: undefined as AbortSignal | undefined,
}));

vi.mock('../../server/thei/ai/sessions/files', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../server/thei/ai/sessions/files')
    >();
  return {
    ...actual,
    async makeSessionFile(...args: Parameters<typeof actual.makeSessionFile>) {
      hooks.fileSignal = args[3];
      await hooks.gates.get('make_file');
      return actual.makeSessionFile(...args);
    },
  };
});

vi.mock('../../server/thei/mcp/registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../server/thei/mcp/registry')>();
  return {
    ...actual,
    directTools: (context: Parameters<typeof actual.directTools>[0]) => [
      ...actual.directTools(context).map((tool) => ({
        ...tool,
        async call(args: unknown, options?: { signal?: AbortSignal }) {
          hooks.called.push(tool.name);
          await hooks.gates.get(tool.name);
          return tool.call(args, options);
        },
      })),
      {
        name: 'hang',
        description: 'Never answers, and does not listen when stopped.',
        inputSchema: { type: 'object', properties: {} },
        call: () => {
          hooks.called.push('hang');
          return new Promise(() => {});
        },
      },
    ],
  };
});

vi.mock('../../server/thei/ai/model/stream', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../server/thei/ai/model/stream')>();
  return {
    ...actual,
    streamTurn: (input: StreamTurnInput) =>
      hooks.stream ? hooks.stream(input) : actual.streamTurn(input),
  };
});

let context: Awaited<ReturnType<typeof freshAiTestDb>>;
let model: FakeModel | undefined;
const LIMITS = { ...TURN_LIMITS };

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  context = await freshAiTestDb();
  Object.assign(globalThis, {
    defineEventHandler,
    createError,
    readBody,
    getRouterParam,
  });
  context.insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  context.rawDb
    .prepare(
      "INSERT INTO projects (projectUuid, title, summary, access, humanReadableSlug, publicId, createdAt, updatedAt) VALUES (?, 'Parapet', 'A browser remake', 'public', 'parapet', 'Parapet', 1, 2)",
    )
    .run(PROJECT);
  Object.assign(TURN_LIMITS, { graceMs: 300 });
});

afterEach(async () => {
  await turnsSettled();
  hooks.gates.clear();
  hooks.called.length = 0;
  hooks.stream = undefined;
  Object.assign(TURN_LIMITS, LIMITS);
  await model?.close();
  model = undefined;
  delete process.env.ANTHROPIC_BASE_URL;
  await context.close();
});

async function useModel(
  script: FakeScript,
  provider: 'openai' | 'anthropic' = 'openai',
) {
  model = await startFakeModel(script);
  Object.assign(context.server, {
    config: aiOnConfig({ model: fakeModelSettings(model, provider) }),
  });
  return model;
}

/** Waits until `check` holds, a little at a time. */
async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('It never came to pass.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

function answers(sessionUuid: string) {
  return sessionMessages(sessionUuid).filter(
    (message) => message.role === 'model',
  );
}

function noticeOf(sessionUuid: string) {
  const parts = answers(sessionUuid).at(-1)?.parts as
    AiMessagePart[] | undefined;
  return parts?.find((part) => part.type === 'notice') as
    Extract<AiMessagePart, { type: 'notice' }> | undefined;
}

/** The text the owner's latest message in a request said. */
function lastWords(body: any): string {
  const said = body.messages.filter((item: any) => item.role === 'user').at(-1);
  return typeof said?.content === 'string' ? said.content : '';
}

/**
 * Whether a conversation as sent to a chat completions service answers
 * every call right after it, and nothing else.
 */
function wellFormed(messages: any[]): boolean {
  for (let at = 0; at < messages.length; at++) {
    const message = messages[at];
    if (message.role === 'tool') return false;
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
    const ids = message.tool_calls.map((call: any) => call.id);
    const answered = messages
      .slice(at + 1, at + 1 + ids.length)
      .map((item: any) => (item.role === 'tool' ? item.tool_call_id : null));
    if (JSON.stringify(answered) !== JSON.stringify(ids)) return false;
    at += ids.length;
  }
  return true;
}

const PROPOSAL = {
  actions: [
    {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A remake of a browser game',
      reason: 'Says what it is',
    },
  ],
};

describe('stopping a turn', () => {
  it('ends a turn waiting on a hung tool at once and frees its slot', async () => {
    await useModel((request) =>
      lastWords(request.body).startsWith('Hang')
        ? { toolCalls: [{ name: 'hang', input: {} }] }
        : { text: 'Answered.' },
    );
    const first = startOwnerSession({ text: 'Hang first' });
    const second = startOwnerSession({ text: 'Hang second' });
    await until(
      () => hooks.called.filter((name) => name === 'hang').length === 2,
    );
    // Both slots are taken: a third session waits.
    const third = startOwnerSession({ text: 'Answer me' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(answers(third)).toHaveLength(0);

    const stoppedAt = Date.now();
    expect(stopTurn(first)).toBe(true);
    await until(() => findSession(first)!.state === 'idle');
    expect(Date.now() - stoppedAt).toBeLessThan(TURN_LIMITS.graceMs);
    expect(noticeOf(first)?.kind).toBe('stopped');
    expect(answers(first)[0]!.transcript.at(-1)).toMatchObject({
      role: 'tool',
      name: 'hang',
      output: 'Stopped before it ran.',
      error: true,
    });
    // Its slot went to the session that waited.
    await until(() => answers(third)[0]?.text === 'Answered.');
    expect(findSession(second)!.state).toBe('running');
    stopTurn(second);
  });

  it('closes a turn that does not end when stopped, and drops what it gets after', async () => {
    await useModel([]);
    const late = gate();
    let asked = false;
    hooks.stream = async () => {
      // A service that ignores being stopped, and answers much later.
      asked = true;
      await late.opened;
      return {
        text: 'Too late.',
        calls: [{ id: 'call_late', name: 'propose', input: PROPOSAL }],
        unshown: new Set(),
      };
    };
    const sessionUuid = startOwnerSession({ text: 'Look at Parapet' });
    await until(() => asked);
    stopTurn(sessionUuid);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(findSession(sessionUuid)!.state).toBe('running');

    // Closed for it once the grace is over: idle, said so, the slot free.
    await until(() => findSession(sessionUuid)!.state === 'idle', 2000);
    expect(noticeOf(sessionUuid)?.kind).toBe('stopped');
    await turnsSettled();
    const closed = answers(sessionUuid)[0]!;

    late.open();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = answers(sessionUuid)[0]!;
    expect(after.text).toBe(closed.text);
    expect(after.transcript).toEqual(closed.transcript);
    expect(sessionActions(sessionUuid)).toHaveLength(0);
    expect(hooks.called).not.toContain('propose');
  });

  it('keeps nothing a proposal made after the stop would insert', async () => {
    await useModel([{ toolCalls: [{ name: 'propose', input: PROPOSAL }] }]);
    const held = gate();
    hooks.gates.set('propose', held.opened);
    const sessionUuid = startOwnerSession({ text: 'Fix the summary' });
    await until(() => hooks.called.includes('propose'));
    stopTurn(sessionUuid);
    await until(() => findSession(sessionUuid)!.state === 'idle');

    held.open();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sessionActions(sessionUuid)).toHaveLength(0);
    expect(findSession(sessionUuid)!.waiting).toBe(0);
  });

  it('leaves a conversation that goes on when stopped midway through calls', async () => {
    await useModel((request, index) =>
      index === 0
        ? {
            toolCalls: [
              {
                id: 'call_read',
                name: 'read_entity',
                input: { ref: `project:${PROJECT}` },
              },
              { id: 'call_hang', name: 'hang', input: {} },
              {
                id: 'call_again',
                name: 'read_entity',
                input: { ref: `project:${PROJECT}` },
              },
            ],
          }
        : { text: 'Going on.' },
    );
    const sessionUuid = startOwnerSession({ text: 'Read Parapet twice' });
    await until(() => hooks.called.includes('hang'));
    stopTurn(sessionUuid);
    await until(() => findSession(sessionUuid)!.state === 'idle');

    const transcript = answers(sessionUuid)[0]!.transcript;
    expect(
      transcript.map((turn: AiTranscriptTurn) =>
        turn.role === 'tool'
          ? [turn.id, turn.error ? 'stopped' : 'answered']
          : turn.role,
      ),
    ).toEqual([
      'assistant',
      ['call_read', 'answered'],
      ['call_hang', 'stopped'],
      ['call_again', 'stopped'],
    ]);

    postOwnerMessage(sessionUuid, { text: 'Go on' });
    await turnsSettled();
    expect(answers(sessionUuid)[1]!.text).toBe('Going on.');
    expect(wellFormed(model!.requests[1]!.body.messages)).toBe(true);
  });
});

describe('a turn out of time', () => {
  for (const provider of ['openai', 'anthropic'] as const)
    it(`stops when the service falls silent midway (${provider})`, async () => {
      Object.assign(TURN_LIMITS, { silenceMs: 200 });
      await useModel(
        [{ text: 'Words that stop here and never go on', stallAfter: 3 }],
        provider,
      );
      const sessionUuid = startOwnerSession({ text: 'Say something' });
      await turnsSettled();
      expect(noticeOf(sessionUuid)?.kind).toBe('timeout');
      expect(findSession(sessionUuid)).toMatchObject({
        state: 'idle',
        error: 'timeout',
      });
      // What it said before it fell silent stays.
      expect(answers(sessionUuid)[0]!.text).toBe('Words that stop ');
    });

  it('stops a turn that takes longer than its clock allows', async () => {
    Object.assign(TURN_LIMITS, { turnMs: 300 });
    await useModel([{ toolCalls: [{ name: 'hang', input: {} }] }]);
    const sessionUuid = startOwnerSession({ text: 'Take forever' });
    await turnsSettled();
    expect(noticeOf(sessionUuid)?.kind).toBe('timeout');
    expect(findSession(sessionUuid)).toMatchObject({
      state: 'idle',
      error: 'timeout',
    });
  });

  it('tells the model of a tool that took too long, and goes on', async () => {
    Object.assign(TURN_LIMITS, { toolMs: 200 });
    await useModel([
      { toolCalls: [{ id: 'call_hang', name: 'hang', input: {} }] },
      { text: 'It did not answer.' },
    ]);
    const sessionUuid = startOwnerSession({ text: 'Try the slow tool' });
    await turnsSettled();
    expect(answers(sessionUuid)[0]!.text).toBe('It did not answer.');
    expect(noticeOf(sessionUuid)).toBeUndefined();
    const told = model!.requests[1]!.body.messages.find(
      (item: any) => item.role === 'tool',
    );
    expect(told.content).toMatch(/hang took longer than 0 s and was left/);
  });

  it('leaves a file that takes too long, and keeps nothing of it', async () => {
    Object.assign(TURN_LIMITS, { toolMs: 200 });
    const held = gate();
    hooks.gates.set('make_file', held.opened);
    await useModel([
      {
        toolCalls: [
          { name: 'make_file', input: { name: 'notes.txt', content: 'x' } },
        ],
      },
      { text: 'It was left.' },
    ]);
    const sessionUuid = startOwnerSession({ text: 'Make me a file' });
    await turnsSettled();
    expect(answers(sessionUuid)[0]!.text).toBe('It was left.');
    // Left, the file is told to stop: what it would still make has no place.
    expect(hooks.fileSignal?.aborted).toBe(true);
    held.open();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      context.rawDb
        .prepare(
          'SELECT count(*) AS n FROM "asset-usages" WHERE containerType = \'ai-session\' AND containerId = ?',
        )
        .get(sessionUuid),
    ).toEqual({ n: 0 });
  });
});

describe('a restart', () => {
  it('puts a cut-off answer right, so the next request is whole', async () => {
    await useModel([{ text: 'Going on.' }]);
    const sessionUuid = createSession({ origin: 'owner', title: 'Cut off' });
    const { db, schema } = context;
    db.transaction((tx) => {
      insertMessage(tx, schema, sessionUuid, {
        role: 'owner',
        text: 'Read Parapet',
        transcript: [{ role: 'user', text: 'Read Parapet' }],
      });
      insertMessage(tx, schema, sessionUuid, {
        role: 'model',
        text: 'Reading',
        parts: [{ type: 'steps', steps: [{ tool: 'read_entity' }] }],
        transcript: [
          {
            role: 'assistant',
            text: 'Reading',
            calls: [
              { id: 'call_read', name: 'read_entity', input: {} },
              { id: 'call_next', name: 'search_archive', input: {} },
            ],
          },
          {
            role: 'tool',
            id: 'call_read',
            name: 'read_entity',
            output: 'Parapet',
          },
        ],
      });
    });
    updateSession(sessionUuid, { state: 'running' });
    // A session that only waited for its turn was cut off in nothing.
    const waited = createSession({ origin: 'owner', title: 'Waited' });
    db.transaction((tx) => {
      insertMessage(tx, schema, waited, {
        role: 'model',
        text: 'Done.',
        transcript: [{ role: 'assistant', text: 'Done.' }],
      });
      insertMessage(tx, schema, waited, { role: 'owner', text: 'And now?' });
    });
    updateSession(waited, { state: 'running' });

    recoverAiSessions();
    expect(findSession(sessionUuid)!.state).toBe('idle');
    expect(noticeOf(sessionUuid)?.kind).toBe('interrupted');
    expect(answers(sessionUuid)[0]!.transcript.at(-1)).toMatchObject({
      id: 'call_next',
      error: true,
    });
    expect(noticeOf(waited)).toBeUndefined();

    postOwnerMessage(sessionUuid, { text: 'Go on' });
    await turnsSettled();
    expect(wellFormed(model!.requests[0]!.body.messages)).toBe(true);
    expect(answers(sessionUuid)[1]!.text).toBe('Going on.');
  });
});

describe('everything at once', () => {
  it('stops every turn and file when AI is turned off', async () => {
    await useModel([
      { toolCalls: [{ name: 'hang', input: {} }] },
      { toolCalls: [{ name: 'hang', input: {} }] },
      { text: 'Never asked.' },
    ]);
    const running = [
      startOwnerSession({ text: 'One' }),
      startOwnerSession({ text: 'Two' }),
    ];
    await until(
      () => hooks.called.filter((name) => name === 'hang').length === 2,
    );
    // Two wait: neither is started on the way, only to be stopped.
    const waiting = [
      startOwnerSession({ text: 'Three' }),
      startOwnerSession({ text: 'Four' }),
    ];
    const app = createSession({ origin: 'app', title: 'App' });
    let job: FileJob | undefined;
    void runFileJob(
      { tokenUuid: 'tk-app', label: 'App', scopes: ['read', 'edit'] },
      app,
      'video.mp4',
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('stopped'))),
        ),
    ).then((done) => (job = done));

    const handler = (await import('../../server/api/admin/ai/settings.put'))
      .default;
    const handle = toWebHandler(
      createApp().use(createRouter().put('/settings', handler)),
    );
    const response = await handle(
      new Request('http://localhost/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
    );
    expect(response.status).toBe(200);

    await until(() =>
      [...running, ...waiting].every(
        (sessionUuid) => findSession(sessionUuid)!.state === 'idle',
      ),
    );
    for (const sessionUuid of running)
      expect(noticeOf(sessionUuid)?.kind).toBe('stopped');
    for (const sessionUuid of waiting)
      expect(answers(sessionUuid)).toHaveLength(0);
    await until(() => job !== undefined);
    expect(job!.status).toBe('cancelled');
  });

  it('cancels the files of an app session archived by the owner', async () => {
    await useModel([]);
    const app = createSession({ origin: 'app', title: 'App' });
    const other = createSession({ origin: 'app', title: 'Other' });
    const principal = {
      tokenUuid: 'tk-app',
      label: 'App',
      scopes: ['read', 'edit'] as ('read' | 'edit')[],
    };
    const signals: AbortSignal[] = [];
    const slow = (signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('stopped'))),
      );
    };
    let cancelled: FileJob | undefined;
    void runFileJob(principal, app, 'video.mp4', slow).then(
      (job) => (cancelled = job),
    );
    void runFileJob(principal, other, 'other.mp4', slow);

    const handler = (
      await import('../../server/api/admin/ai/sessions/[sessionUuid]/index.patch')
    ).default;
    const handle = toWebHandler(
      createApp().use(createRouter().patch('/sessions/:sessionUuid', handler)),
    );
    const response = await handle(
      new Request(`http://localhost/sessions/${app}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      }),
    );
    expect(response.status).toBe(200);
    expect(findSession(app)!.closedAt).not.toBeNull();
    await until(() => cancelled !== undefined);
    expect(cancelled!.status).toBe('cancelled');
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    cancelSessionFileJobs(other);
  });
});
