import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEFAULT_AI_MODEL } from '../../shared/ai-model';
import type { AiMessagePart } from '../../shared/ai';
import { sessionActions } from '../../server/thei/ai/actions/rows';
import { subscribeSession } from '../../server/thei/ai/sessions/bus';
import {
  postOwnerMessage,
  startOwnerSession,
} from '../../server/thei/ai/sessions/owner';
import {
  findSession,
  sessionMessages,
} from '../../server/thei/ai/sessions/store';
import { sessionDetail } from '../../server/thei/ai/sessions/view';
import { deleteSession } from '../../server/thei/ai/sessions/lifecycle';
import { createAsset } from '../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../server/thei/assets/repository/find-by-slug';
import { stopTurn, turnsSettled } from '../../server/thei/ai/runner/queue';
import { recordUsage } from '../../server/thei/ai/model/usage';
import {
  startFakeModel,
  type FakeModel,
  type FakeScript,
} from '../helpers/fake-model';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * A session answered by the owner's model: its words streamed and saved,
 * the site's tools called on the way, what it proposes kept as actions of
 * the session, a question left for the owner, and every way a turn ends
 * early said in the session.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;
let model: FakeModel | undefined;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    console: { log() {}, warn() {}, error() {} },
    ...serverRepositories,
  });
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ app: { baseURL: '/' } }),
  });
  context.rawDb
    .prepare(
      "INSERT INTO profiles (profileId, displayName) VALUES ('profile', 'Owner')",
    )
    .run();
  context.rawDb
    .prepare(
      "INSERT INTO projects (projectUuid, title, summary, access, humanReadableSlug, publicId, createdAt, updatedAt) VALUES (?, 'Parapet', 'A browser remake', 'public', 'parapet', 'Parapet', 1, 2)",
    )
    .run(PROJECT);
});

afterEach(async () => {
  await turnsSettled();
  await model?.close();
  model = undefined;
  delete process.env.ANTHROPIC_BASE_URL;
  await context.close();
});

async function useModel(
  script: FakeScript,
  provider: 'openai' | 'anthropic' = 'openai',
  options: Parameters<typeof startFakeModel>[1] = {},
) {
  model = await startFakeModel(script, options);
  if (provider === 'anthropic') process.env.ANTHROPIC_BASE_URL = model.url;
  Object.assign(context.server, {
    config: {
      siteUrl: 'https://example.test',
      languageCode: 'en',
      mcp: {
        enabled: true,
        instructions: '',
        model: {
          provider,
          apiKey: provider === 'anthropic' ? 'sk-test' : '',
          baseUrl: provider === 'openai' ? model.url : '',
          model: 'fake-small',
        },
        monthlyTokens: 1_000_000,
      },
    },
  });
  return model;
}

function modelMessage(sessionUuid: string) {
  return sessionMessages(sessionUuid).filter(
    (message) => message.role === 'model',
  );
}

function partOf<T extends AiMessagePart['type']>(
  parts: AiMessagePart[],
  type: T,
) {
  return parts.find((part) => part.type === type) as
    Extract<AiMessagePart, { type: T }> | undefined;
}

describe('a session turn', () => {
  it('reads, proposes and answers, its words streamed and saved', async () => {
    await useModel([
      {
        toolCalls: [
          { name: 'read_entity', input: { ref: `project:${PROJECT}` } },
        ],
      },
      {
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
      },
      {
        text: `I proposed a clearer summary for [Parapet](thei:project/${PROJECT}).`,
      },
    ]);
    const deltas: string[] = [];
    const sessionUuid = startOwnerSession({
      text: `Look at [Parapet](thei:project/${PROJECT})`,
    });
    const unsubscribe = subscribeSession(sessionUuid, (signal) => {
      if (signal.type === 'delta') deltas.push(signal.text);
    });
    await turnsSettled();
    unsubscribe();

    const [answer] = modelMessage(sessionUuid);
    expect(answer!.text).toBe(
      `I proposed a clearer summary for [Parapet](thei:project/${PROJECT}).`,
    );
    expect(deltas.join('')).toBe(answer!.text);
    expect(partOf(answer!.parts, 'steps')?.steps).toEqual([
      { tool: 'read_entity', refs: [`project:${PROJECT}`] },
      { tool: 'propose', refs: [`project:${PROJECT}`] },
    ]);
    const [action] = sessionActions(sessionUuid);
    expect(action).toMatchObject({
      kind: 'field',
      state: 'pending',
      messageUuid: answer!.messageUuid,
    });
    expect(findSession(sessionUuid)).toMatchObject({
      state: 'idle',
      waiting: 1,
      model: 'fake-small',
    });
    expect(findSession(sessionUuid)!.tokens).toBeGreaterThan(0);
    const detail = await sessionDetail(sessionUuid);
    expect(detail!.session.about.map((item) => item.ref)).toEqual([
      `project:${PROJECT}`,
    ]);

    // The model read the tool's answer, and a later turn reads it all again.
    const second = model!.requests[1]!.body.messages;
    expect(second.find((item: any) => item.role === 'tool')?.content).toMatch(
      /Parapet/,
    );
    expect(
      model!.requests[0]!.body.tools.map((tool: any) => tool.function.name),
    ).toEqual(expect.arrayContaining(['read_entity', 'propose', 'ask_owner']));
    expect(
      model!.requests[0]!.body.tools.map((tool: any) => tool.function.name),
    ).not.toContain('suggest_field');
  });

  it('counts the proposals the code turned away', async () => {
    const proposal = {
      kind: 'field',
      target: `project:${PROJECT}`,
      field: 'summary',
      value: 'A game of walls',
      reason: 'Shorter',
    };
    await useModel([
      { toolCalls: [{ name: 'propose', input: { actions: [proposal] } }] },
      { text: 'Proposed.' },
      { toolCalls: [{ name: 'propose', input: { actions: [proposal] } }] },
      { text: 'Proposed again.' },
    ]);
    const sessionUuid = startOwnerSession({ text: 'Shorten it' });
    await turnsSettled();
    postOwnerMessage(sessionUuid, { text: 'Once more' });
    await turnsSettled();

    const [first, second] = modelMessage(sessionUuid);
    expect(partOf(first!.parts, 'steps')?.steps).toEqual([
      { tool: 'propose', refs: [`project:${PROJECT}`] },
    ]);
    // The same change already waits for the owner: nothing new to show.
    expect(partOf(second!.parts, 'steps')?.steps).toEqual([
      { tool: 'propose', refs: [`project:${PROJECT}`], refused: 1 },
    ]);
    expect(sessionActions(sessionUuid)).toHaveLength(1);
  });

  it('names the session in its first answer, once, and never over the owner', async () => {
    const offered = (index: number) =>
      (model!.requests[index]!.body.tools as { function: { name: string } }[])
        .map((tool) => tool.function.name)
        .includes('name_session');
    await useModel(async (request, index) =>
      index === 0
        ? {
            text: 'Shorter it is.',
            toolCalls: [
              { name: 'name_session', input: { name: 'A shorter summary.' } },
            ],
          }
        : { text: 'Done.' },
    );
    const long =
      'Please make the summary of the project shorter, it reads like a whole page';
    const sessionUuid = startOwnerSession({ text: long });
    // Until the model names it, it goes by the start of the first words.
    expect(findSession(sessionUuid)!.title).toBe(
      'Please make the summary of the project…',
    );
    await turnsSettled();
    expect(offered(0)).toBe(true);
    // A name is a heading: no full stop at its end.
    expect(findSession(sessionUuid)!.title).toBe('A shorter summary');
    // Named, its steps say nothing of it, and it is not offered again.
    expect(
      partOf(modelMessage(sessionUuid)[0]!.parts, 'steps'),
    ).toBeUndefined();
    postOwnerMessage(sessionUuid, { text: 'Thanks' });
    await turnsSettled();
    expect(offered(model!.requests.length - 1)).toBe(false);

    // A session the owner named is the owner's to rename.
    const named = startOwnerSession({ title: 'Mine', text: long });
    await turnsSettled();
    expect(offered(model!.requests.length - 1)).toBe(false);
    expect(findSession(named)!.title).toBe('Mine');
  });

  it('asks the owner, and goes on with their answer', async () => {
    await useModel(async (request, index) =>
      index === 0
        ? {
            toolCalls: [
              {
                name: 'ask_owner',
                input: {
                  question: 'Which summary reads better?',
                  options: ['The short one', 'The long one'],
                },
              },
            ],
          }
        : { text: 'Then the short one.' },
    );
    const sessionUuid = startOwnerSession({ text: 'Fix the summary' });
    await turnsSettled();
    const [asked] = modelMessage(sessionUuid);
    expect(partOf(asked!.parts, 'question')).toEqual({
      type: 'question',
      text: 'Which summary reads better?',
      options: ['The short one', 'The long one'],
    });
    expect(findSession(sessionUuid)?.waiting).toBe(1);
    expect(model!.requests).toHaveLength(1);

    postOwnerMessage(sessionUuid, {
      text: 'The short one',
      answers: asked!.messageUuid,
    });
    await turnsSettled();
    expect(
      partOf(sessionMessages(sessionUuid)[1]!.parts, 'question')?.answer,
    ).toBe('The short one');
    expect(findSession(sessionUuid)?.waiting).toBe(0);
    const said = model!.requests[1]!.body.messages.at(-1);
    expect(said).toMatchObject({ role: 'user' });
    expect(said.content).toMatch(/My answer to “Which summary reads better\?”/);
    expect(modelMessage(sessionUuid).at(-1)!.text).toBe('Then the short one.');
  });

  it('gives a page that comes mid-answer every word so far, and where the next stand', async () => {
    await useModel([
      {
        text: 'A long answer that keeps going word by word for a while yet.',
        delayMs: 20,
      },
    ]);
    const sessionUuid = startOwnerSession({ text: 'Tell me' });
    const deltas: { text: string; at: number }[] = [];
    // A page comes in after a few words: what it reads, and the words that
    // follow from where they stand, make the answer whole.
    let read: string | undefined;
    const unsubscribe = subscribeSession(sessionUuid, (signal) => {
      if (signal.type !== 'delta') return;
      deltas.push({ text: signal.text, at: signal.at });
      if (deltas.length === 4)
        void sessionDetail(sessionUuid).then((detail) => {
          read = detail!.messages.find((item) => item.role === 'model')!.text;
        });
    });
    await turnsSettled();
    unsubscribe();

    let whole = '';
    for (const delta of deltas) {
      expect(delta.at).toBe(whole.length);
      whole += delta.text;
    }
    const answer = modelMessage(sessionUuid).at(-1)!;
    expect(whole).toBe(answer.text);
    expect(read).toBe(whole.slice(0, read!.length));
    expect(read!.length).toBeGreaterThanOrEqual(
      deltas.slice(0, 4).reduce((sum, delta) => sum + delta.text.length, 0),
    );
    // Once saved, the message is read from the database again.
    const detail = await sessionDetail(sessionUuid);
    expect(
      detail!.messages.find((item) => item.role === 'model')!.content,
    ).not.toBeNull();
  });

  it('stops when told, keeping what it wrote', async () => {
    await useModel([
      {
        text: 'A long answer that keeps going word by word for a while.',
        delayMs: 30,
      },
    ]);
    const sessionUuid = startOwnerSession({ text: 'Tell me everything' });
    await new Promise<void>((resolve) => {
      const unsubscribe = subscribeSession(sessionUuid, (signal) => {
        if (signal.type === 'delta') {
          unsubscribe();
          resolve();
        }
      });
    });
    expect(stopTurn(sessionUuid)).toBe(true);
    await turnsSettled();
    const [answer] = modelMessage(sessionUuid);
    expect(partOf(answer!.parts, 'notice')?.kind).toBe('stopped');
    expect(answer!.text.length).toBeGreaterThan(0);
    expect(findSession(sessionUuid)).toMatchObject({
      state: 'idle',
      error: null,
    });
  });

  it('says when the key is refused, or the month is spent', async () => {
    await useModel([
      { error: { status: 401, body: { error: { message: 'bad key' } } } },
    ]);
    const refused = startOwnerSession({ text: 'Hello' });
    await turnsSettled();
    expect(partOf(modelMessage(refused)[0]!.parts, 'notice')).toMatchObject({
      kind: 'key',
      text: expect.stringMatching(/bad key/),
    });
    expect(findSession(refused)?.error).toBe('key');

    recordUsage({
      inputTokens: 2_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    const spent = startOwnerSession({ text: 'Hello again' });
    await turnsSettled();
    expect(partOf(modelMessage(spent)[0]!.parts, 'notice')?.kind).toBe('limit');
    expect(model!.requests).toHaveLength(1);
  });

  it('asks to set a model when there is none', async () => {
    Object.assign(context.server, {
      config: {
        siteUrl: 'https://example.test',
        languageCode: 'en',
        mcp: {
          enabled: true,
          instructions: '',
          model: { ...DEFAULT_AI_MODEL },
          monthlyTokens: 10_000_000,
        },
      },
    });
    const sessionUuid = startOwnerSession({ text: 'Hello' });
    await turnsSettled();
    expect(partOf(modelMessage(sessionUuid)[0]!.parts, 'notice')?.kind).toBe(
      'no-model',
    );
  });

  it('asks again without stream options for a server that refuses them', async () => {
    await useModel([{ text: 'Hi.' }], 'openai', { refuseStreamOptions: true });
    const sessionUuid = startOwnerSession({ text: 'Hello' });
    await turnsSettled();
    expect(modelMessage(sessionUuid)[0]!.text).toBe('Hi.');
    expect(model!.requests.at(-1)!.body.stream_options).toBeUndefined();
  });

  it('shows the model what the owner brings, and gives it a place in the session', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thei-ai-files-'));
    const files: Record<string, string> = {
      png: join(dir, 'photo.png'),
      txt: join(dir, 'notes.txt'),
      zip: join(dir, 'all.zip'),
    };
    await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#cc0000' },
    })
      .png()
      .toFile(files.png!);
    writeFileSync(files.txt!, 'Tickets: row 7');
    writeFileSync(files.zip!, 'PK');
    const insert = context.rawDb.prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt, meta)
       VALUES (?, ?, ?, ?, ?, 'original', '{"type":"original"}', ?, ?, 1, ?)`,
    );
    insert.run(
      'a-photo',
      'photo',
      'png',
      'af-1',
      'h1',
      'image',
      900,
      '{"width":40,"height":30}',
    );
    insert.run('a-notes', 'notes', 'txt', 'af-2', 'h2', 'other', 14, null);
    insert.run('a-zip', 'zip', 'zip', 'af-3', 'h3', 'other', 2, null);
    Object.assign(context.server, {
      assets: {
        ...serverRepositories.assets,
        filePath: (_hash: string, extension: string) => files[extension]!,
      },
    });
    await useModel([{ text: 'A red photo and a row.' }], 'anthropic');

    const sessionUuid = startOwnerSession({
      text: 'Look',
      files: [
        { assetUuid: 'a-photo', name: 'IMG_1.png' },
        { assetUuid: 'a-notes', name: 'notes.txt' },
        { assetUuid: 'a-zip', name: 'all.zip' },
      ],
    });
    await turnsSettled();

    const [said, picture, notes] = model!.requests[0]!.body.messages[0].content;
    // Every file is named, with its id; what a model can see is shown.
    expect(said.text).toContain('«IMG_1.png»: a picture 40×30');
    expect(said.text).toContain('«all.zip»: a file, ZIP');
    expect(said.text).toContain('a-zip');
    expect(picture).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    });
    expect(notes).toMatchObject({ type: 'text' });
    expect(notes.text).toContain('Tickets: row 7');

    // The files have their place in the session, and the page reads them.
    const placed = () =>
      context.rawDb
        .prepare(
          "SELECT assetUuid FROM \"asset-usages\" WHERE containerType = 'ai-session' AND containerId = ? AND role = 'ai-attachment'",
        )
        .all(sessionUuid);
    expect(placed()).toHaveLength(3);
    const detail = await sessionDetail(sessionUuid);
    expect(
      detail!.messages[0]!.files.map((file) => [file.name, file.asset?.type]),
    ).toEqual([
      ['IMG_1.png', 'image'],
      ['notes.txt', 'other'],
      ['all.zip', 'other'],
    ]);

    // Deleted, the session lets them go: each starts its last day.
    deleteSession(sessionUuid, 5000);
    expect(placed()).toHaveLength(0);
    expect(
      context.rawDb
        .prepare("SELECT touchedAt FROM assets WHERE assetUuid = 'a-photo'")
        .get(),
    ).toEqual({ touchedAt: 5000 });
  });

  it('makes a file the owner asks for, of whatever kind its name says', async () => {
    Object.assign(context.server, {
      projectPath: (...parts: string[]) => join(context.directory, ...parts),
      assets: {
        ...serverRepositories.assets,
        create: createAsset,
        findByIdentity: findAssetByIdentity,
        findBySlug: findAssetBySlug,
        filePath: (hash: string, extension: string) =>
          join(context.directory, 'assets', `${hash}.${extension}`),
      },
    });
    await useModel([
      {
        toolCalls: [
          { name: 'make_file', input: { name: 'trips', content: 'x' } },
          {
            name: 'make_file',
            input: { name: 'trips.csv', content: 'Where,When\nRome,May\n' },
          },
        ],
      },
      { text: 'Here is the table.' },
    ]);
    const sessionUuid = startOwnerSession({ text: 'A table of trips, please' });
    await turnsSettled();

    // A name with no extension says no kind: the model hears why.
    const tools = model!.requests[1]!.body.messages.filter(
      (message: { role: string }) => message.role === 'tool',
    );
    expect(tools[0].content).toMatch(/extension/);
    expect(tools[1].content).toMatch(/^Made «trips\.csv» as a-/);

    // The file stands under the answer and is kept in the session.
    const detail = await sessionDetail(sessionUuid);
    const answer = detail!.messages.find((one) => one.role === 'model')!;
    expect(answer.text).toBe('Here is the table.');
    expect(answer.files).toHaveLength(1);
    expect(answer.files[0]).toMatchObject({
      name: 'trips.csv',
      asset: { type: 'other', extension: 'csv' },
    });
    expect(
      context.rawDb
        .prepare(
          'SELECT count(*) AS n FROM "asset-usages" WHERE containerType = \'ai-session\' AND containerId = ?',
        )
        .get(sessionUuid),
    ).toEqual({ n: 1 });
  });

  it('refuses a file the library does not have, before anything is made', () => {
    expect(() =>
      startOwnerSession({
        text: 'Look',
        files: [{ assetUuid: 'a-nothing', name: 'x.png' }],
      }),
    ).toThrow(/no file a-nothing/);
    expect(
      context.rawDb.prepare('SELECT count(*) AS n FROM `ai-sessions`').get(),
    ).toEqual({ n: 0 });
  });

  it('speaks Anthropic too, its own turn handed back whole', async () => {
    await useModel(
      [
        {
          text: 'Let me read it.',
          toolCalls: [
            { name: 'read_entity', input: { ref: `project:${PROJECT}` } },
          ],
        },
        { text: 'It is a remake.' },
      ],
      'anthropic',
    );
    const sessionUuid = startOwnerSession({ text: 'What is Parapet?' });
    await turnsSettled();
    expect(modelMessage(sessionUuid)[0]!.text).toBe(
      'Let me read it.\n\nIt is a remake.',
    );
    const second = model!.requests[1]!.body;
    expect(second.stream).toBe(true);
    expect(second.tools[0]).toMatchObject({ eager_input_streaming: true });
    expect(second.messages.at(-2)).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me read it.' },
        { type: 'tool_use', name: 'read_entity' },
      ],
    });
    expect(second.messages.at(-1).content[0]).toMatchObject({
      type: 'tool_result',
    });
  });
});
