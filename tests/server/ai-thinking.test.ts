import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionActions } from '../../server/thei/ai/actions/rows';
import {
  postOwnerMessage,
  startOwnerSession,
} from '../../server/thei/ai/sessions/owner';
import {
  findSession,
  linkSessionEntities,
  sessionMessages,
  updateSession,
} from '../../server/thei/ai/sessions/store';
import { turnsSettled } from '../../server/thei/ai/runner/queue';
import { serverDay } from '../../server/thei/ai/runner/context';
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
 * A conversation with a model that thinks, as Anthropic's newer models do:
 * each answer's thinking is bound to everything sent before it, and sent
 * back over anything else it is refused (the fake model keeps the service's
 * rule, `signThinking`). A session goes on turn after turn whatever happens
 * around it — named, linked to more, a new day, other instructions — and
 * when what came before did change, it leaves the old thinking out rather
 * than fail.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
let model: FakeModel | undefined;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const OTHER = 'p-22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  context = await freshAiTestDb();
  context.insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  const project = context.rawDb.prepare(
    "INSERT INTO projects (projectUuid, title, summary, access, humanReadableSlug, publicId, createdAt, updatedAt) VALUES (?, ?, 'A browser remake', 'public', ?, ?, 1, 2)",
  );
  project.run(PROJECT, 'Parapet', 'parapet', 'Parapet');
  project.run(OTHER, 'Rampart', 'rampart', 'Rampart');
});

afterEach(async () => {
  vi.useRealTimers();
  await turnsSettled();
  await model?.close();
  model = undefined;
  delete process.env.ANTHROPIC_BASE_URL;
  await context.close();
});

async function useThinkingModel(script: FakeScript) {
  model = await startFakeModel(script, { signThinking: true });
  Object.assign(context.server, {
    config: aiOnConfig({
      model: fakeModelSettings(model, 'anthropic'),
      monthlyTokens: 10_000_000,
    }),
  });
  return model;
}

/** Answers every call with a few words, naming the session first. */
const chatty: FakeScript = (request, index) =>
  index === 0
    ? {
        text: 'Hello.',
        toolCalls: [{ name: 'name_session', input: { name: 'A chat' } }],
      }
    : { text: `Answer ${index}.` };

/** The thinking blocks a request sends back. */
function thinkingSent(index: number) {
  return (model!.requests[index]!.body.messages as any[]).flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter((block: any) => block.type === 'thinking')
      : [],
  );
}

function notices(sessionUuid: string) {
  return sessionMessages(sessionUuid).flatMap((message) =>
    message.parts.filter((part) => part.type === 'notice'),
  );
}

describe('a conversation that only grows', () => {
  it('goes on after the model named it, its thinking sent back whole', async () => {
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({ text: 'Hi there' });
    await turnsSettled();
    postOwnerMessage(sessionUuid, { text: 'And then?' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(notices(sessionUuid)).toEqual([]);
    // Every answer so far thought once; all of it goes back.
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(2);
    // Instructions and tools: the same in every request.
    const first = model!.requests[0]!.body;
    const last = model!.requests.at(-1)!.body;
    expect(last.system).toEqual(first.system);
    expect(last.tools).toEqual(first.tools);
    expect(findSession(sessionUuid)!.context?.sent?.turns).toBeGreaterThan(0);
  });

  it('goes on when a message names more, and a check links more to it', async () => {
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({
      text: `Look at [Parapet](thei:project/${PROJECT})`,
    });
    await turnsSettled();
    postOwnerMessage(sessionUuid, {
      text: `And [Rampart](thei:project/${OTHER})`,
    });
    await turnsSettled();
    const { db, schema } = THEI_SERVER.useDb();
    db.transaction((tx) =>
      linkSessionEntities(
        tx,
        schema,
        sessionUuid,
        [{ type: 'project', id: OTHER, role: 'about' }],
        Date.now(),
      ),
    );
    postOwnerMessage(sessionUuid, { text: 'Both, then.' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(3);
  });

  it('goes on after a comment on a proposal', async () => {
    await useThinkingModel((request, index) =>
      index === 0
        ? {
            toolCalls: [
              {
                name: 'propose',
                input: {
                  actions: [
                    {
                      kind: 'field',
                      target: `project:${PROJECT}`,
                      field: 'summary',
                      value: 'A remake of a browser game',
                      reason: 'Says what it is',
                    },
                  ],
                },
              },
            ],
          }
        : { text: `Answer ${index}.` },
    );
    const sessionUuid = startOwnerSession({
      title: 'Summary',
      text: 'Shorter summary, please',
    });
    await turnsSettled();
    const [action] = sessionActions(sessionUuid);
    postOwnerMessage(sessionUuid, {
      text: 'Shorter still',
      comment: action!.actionUuid,
    });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(notices(sessionUuid)).toEqual([]);
  });

  it('tells a new day, and changed instructions, without touching what came before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({ text: 'Hi' });
    await turnsSettled();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    Object.assign(THEI_SERVER.config.mcp, { instructions: 'Answer in rhyme.' });
    postOwnerMessage(sessionUuid, { text: 'Next day' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    const last = model!.requests.at(-1)!.body;
    expect(last.system).toEqual(model!.requests[0]!.body.system);
    const said = JSON.stringify(last.messages);
    expect(said).toContain('it is 2026-10-18 now');
    expect(said).toContain('Answer in rhyme.');
    expect(findSession(sessionUuid)!.context?.day).toBe(serverDay());
    // Told once: the next turn on the same day says nothing more.
    postOwnerMessage(sessionUuid, { text: 'Same day' });
    await turnsSettled();
    expect(
      JSON.stringify(model!.requests.at(-1)!.body.messages).split(
        'it is 2026-10-18 now',
      ),
    ).toHaveLength(2);
  });
});

describe('a conversation that changed under its model', () => {
  it('leaves the old thinking out when another model goes on', async () => {
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({ text: 'Hi' });
    await turnsSettled();
    updateSession(sessionUuid, { model: 'fake-large' });
    postOwnerMessage(sessionUuid, { text: 'Go on' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(0);
    // From then on its own thinking goes back again.
    postOwnerMessage(sessionUuid, { text: 'And more' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(1);
  });

  it('leaves it out when the tools changed, or an earlier message', async () => {
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({ text: 'Hi' });
    await turnsSettled();
    // An update that rewrote a tool's words.
    const kept = findSession(sessionUuid)!.context!;
    updateSession(sessionUuid, {
      context: { ...kept, toolsDigest: 'an older release' },
    });
    postOwnerMessage(sessionUuid, { text: 'Go on' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(0);

    // Words of an earlier message that no longer read as they were sent.
    const [first] = sessionMessages(sessionUuid);
    context.rawDb
      .prepare('UPDATE `ai-messages` SET transcript = ? WHERE messageUuid = ?')
      .run(
        JSON.stringify([{ role: 'user', text: 'Hi, changed' }]),
        first!.messageUuid,
      );
    postOwnerMessage(sessionUuid, { text: 'Once more' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(notices(sessionUuid)).toEqual([]);
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(0);
  });

  it('leaves out the thinking of a session begun before it kept what it sent', async () => {
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({ text: 'Hi' });
    await turnsSettled();
    updateSession(sessionUuid, { context: null });
    postOwnerMessage(sessionUuid, { text: 'Go on' });
    await turnsSettled();
    expect(model!.refused).toEqual([]);
    expect(notices(sessionUuid)).toEqual([]);
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(0);
  });

  it('asks again without it when the service refuses what nothing here saw', async () => {
    await useThinkingModel(chatty);
    const sessionUuid = startOwnerSession({ text: 'Hi' });
    await turnsSettled();
    // A signature spoilt where nothing compares it: only the service sees.
    const [, answer] = sessionMessages(sessionUuid);
    const transcript = answer!.transcript.map((turn: any) =>
      turn.role === 'assistant'
        ? {
            ...turn,
            native: {
              ...turn.native,
              content: turn.native.content.map((block: any) =>
                block.type === 'thinking'
                  ? { ...block, signature: 'spoilt' }
                  : block,
              ),
            },
          }
        : turn,
    );
    context.rawDb
      .prepare('UPDATE `ai-messages` SET transcript = ? WHERE messageUuid = ?')
      .run(JSON.stringify(transcript), answer!.messageUuid);
    postOwnerMessage(sessionUuid, { text: 'Go on' });
    await turnsSettled();
    expect(model!.refused).toHaveLength(1);
    expect(notices(sessionUuid)).toEqual([]);
    // Asked again with its thinking still on, and none of before.
    const last = model!.requests.at(-1)!.body;
    expect(last.thinking).toMatchObject({ type: 'adaptive' });
    expect(thinkingSent(model!.requests.length - 1)).toHaveLength(0);
    // And it stays left out: the next turn is not refused.
    postOwnerMessage(sessionUuid, { text: 'Still there?' });
    await turnsSettled();
    expect(model!.refused).toHaveLength(1);
  });
});
