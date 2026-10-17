import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import sharp from 'sharp';
import { runFfmpeg } from '../../server/thei/assets/ffmpeg';
import { startOwnerSession } from '../../server/thei/ai/sessions/owner';
import { sessionMessages } from '../../server/thei/ai/sessions/store';
import { modelFiles } from '../../server/thei/ai/sessions/files';
import { turnsSettled } from '../../server/thei/ai/runner/queue';
import {
  startFakeModel,
  type FakeModel,
  type FakeModelOptions,
  type FakeScript,
} from '../helpers/fake-model';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * Files as the site's model is shown them: each in the form its service
 * takes — a picture, a PDF, a recording's sound as MP3, a video's frame and
 * sound — whether the owner brought it or a tool showed it; and a block the
 * service turns away is asked again without, the model told in words what it
 * could not be shown.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;
let model: FakeModel | undefined;

beforeEach(async () => {
  context = await freshTestDb();
  const picture = join(context.directory, 'photo.png');
  const recording = join(context.directory, 'talk.wav');
  await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#00cc00' },
  })
    .png()
    .toFile(picture);
  // Two seconds of a tone, as a recording.
  expect(
    await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      recording,
    ]),
  ).toBe(0);
  const files: Record<string, string> = { png: picture, wav: recording };
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    console: { log() {}, warn() {}, error() {} },
    ...serverRepositories,
    assets: {
      ...serverRepositories.assets,
      filePath: (_hash: string, extension: string) => files[extension]!,
    },
  });
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ app: { baseURL: '/' } }),
  });
  context.rawDb
    .prepare(
      "INSERT INTO profiles (profileId, displayName) VALUES ('profile', 'Owner')",
    )
    .run();
  const insert = context.rawDb.prepare(
    `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt, meta)
     VALUES (?, ?, ?, ?, ?, 'original', '{"type":"original"}', ?, 900, 1, ?)`,
  );
  insert.run(
    'a-photo',
    'photo',
    'png',
    'af-photo',
    'h-photo',
    'image',
    '{"width":40,"height":30}',
  );
  insert.run(
    'a-talk',
    'talk',
    'wav',
    'af-talk',
    'h-talk',
    'audio',
    '{"duration":2,"peaks":[]}',
  );
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
  provider: 'openai' | 'anthropic',
  options: FakeModelOptions = {},
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

/** Every part of every message of a request, flattened. */
function partsOf(body: any): any[] {
  return (body.messages as any[]).flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.flatMap((part: any) =>
          part.type === 'tool_result' && Array.isArray(part.content)
            ? [part, ...part.content]
            : [part],
        )
      : [],
  );
}

describe('files shown to the site’s model', () => {
  it('lets a recording be heard as MP3 by a service that takes sound', async () => {
    await useModel([{ text: 'A tone.' }], 'openai');
    startOwnerSession({
      text: 'Listen',
      files: [{ assetUuid: 'a-talk', name: 'talk.wav' }],
    });
    await turnsSettled();
    const audio = partsOf(model!.requests[0]!.body).find(
      (part) => part.type === 'input_audio',
    );
    expect(audio.input_audio.format).toBe('mp3');
    // An MP3: a frame sync or an ID3 header at its start.
    const head = Buffer.from(audio.input_audio.data, 'base64').subarray(0, 3);
    expect(
      head.toString('latin1') === 'ID3' ||
        (head[0] === 0xff && head[1]! >= 0xe0),
    ).toBe(true);
  });

  it('asks again without a block the service refuses, and says so', async () => {
    await useModel([{ text: 'I could not hear it.' }], 'openai', {
      refuseBlocks: ['input_audio'],
    });
    const sessionUuid = startOwnerSession({
      text: 'Listen',
      files: [
        { assetUuid: 'a-talk', name: 'talk.wav' },
        { assetUuid: 'a-photo', name: 'photo.png' },
      ],
    });
    await turnsSettled();
    // Turned away once with the sound; then the sound is told of in words
    // and the picture still shown.
    expect(model!.refused).toHaveLength(1);
    expect(model!.requests).toHaveLength(1);
    const parts = partsOf(model!.requests[0]!.body);
    expect(parts.some((part) => part.type === 'input_audio')).toBe(false);
    expect(parts.some((part) => part.type === 'image_url')).toBe(true);
    expect(
      parts.find(
        (part) =>
          part.type === 'text' &&
          part.text.includes(
            '«talk.wav» is a recording that could not be shown',
          ),
      ),
    ).toBeTruthy();
    expect(
      sessionMessages(sessionUuid).find((message) => message.role === 'model')!
        .text,
    ).toBe('I could not hear it.');
  });

  it('tells Claude of a recording in words: it takes no sound', async () => {
    await useModel([{ text: 'Noted.' }], 'anthropic');
    startOwnerSession({
      text: 'Listen',
      files: [{ assetUuid: 'a-talk', name: 'talk.wav' }],
    });
    await turnsSettled();
    const parts = partsOf(model!.requests[0]!.body);
    expect(parts.some((part) => part.type === 'document')).toBe(false);
    expect(
      parts.some(
        (part) =>
          part.type === 'text' && part.text.includes('could not be shown'),
      ),
    ).toBe(true);
  });

  it('shows Claude what look_at_file showed, in the tool’s answer', async () => {
    await useModel(
      [
        {
          toolCalls: [{ name: 'look_at_file', input: { file: 'a-photo' } }],
        },
        { text: 'A green square.' },
      ],
      'anthropic',
    );
    startOwnerSession({ text: 'What is a-photo?' });
    await turnsSettled();
    const answer = (model!.requests[1]!.body.messages as any[])
      .at(-1)
      .content.find((part: any) => part.type === 'tool_result');
    expect(answer.content[0]).toMatchObject({ type: 'text' });
    expect(answer.content[0].text).toContain('File a-photo');
    expect(answer.content[1]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    });
  });

  it('shows a chat completions model the same, in a message after the answers', async () => {
    await useModel(
      [
        {
          toolCalls: [{ name: 'look_at_file', input: { file: 'a-photo' } }],
        },
        { text: 'A green square.' },
      ],
      'openai',
    );
    startOwnerSession({ text: 'What is a-photo?' });
    await turnsSettled();
    const messages = model!.requests[1]!.body.messages as any[];
    const tool = messages.findIndex((message) => message.role === 'tool');
    expect(typeof messages[tool].content).toBe('string');
    expect(messages[tool + 1]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'The files your tools showed above:' },
        { type: 'image_url' },
      ],
    });
  });
});

describe('files made ready for a model', () => {
  const shown = (id: string, name: string) =>
    modelFiles([{ role: 'user', files: [id] }], new Map([[id, name]]));

  it('names a file kept ready by the name it goes by now', async () => {
    const insert = context.rawDb.prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt, meta)
       VALUES ('a-named', 'named', 'png', 'af-named', 'h-named', 'original', '{"type":"original"}', 'image', 900, 1, '{}')`,
    );
    insert.run();
    // Asked for twice at once, it is made once over and kept once.
    const [first, again] = await Promise.all([
      shown('a-named', 'first.png'),
      shown('a-named', 'first.png'),
    ]);
    expect(first.get('a-named')![0]).toMatchObject({ name: 'first.png' });
    expect(again.get('a-named')![0]).toMatchObject({ name: 'first.png' });
    const later = await shown('a-named', 'later.png');
    expect(later.get('a-named')![0]).toMatchObject({
      kind: 'image',
      name: 'later.png',
    });
  });

  it('keeps a video ready only once its frame came', async () => {
    const insert = context.rawDb.prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 900, 1, '{}')`,
    );
    // A video's sound read from the recording, its frame from the picture.
    insert.run(
      'a-clip',
      'clip',
      'wav',
      'af-clip',
      'h-clip',
      'original',
      '{"type":"original"}',
      'video',
    );
    const before = await shown('a-clip', 'clip.mp4');
    expect(before.get('a-clip')!.map((block) => block.kind)).toEqual(['audio']);

    insert.run(
      'a-clip-preview',
      'clip-preview',
      'png',
      'af-clip',
      'h-clip-preview',
      'preview',
      null,
      'image',
    );
    context.rawDb
      .prepare(
        "INSERT INTO \"asset-usages\" (assetUuid, containerType, containerId, role) VALUES ('a-clip-preview', 'asset', 'a-clip', 'preview')",
      )
      .run();
    const after = await shown('a-clip', 'clip.mp4');
    expect(after.get('a-clip')!.map((block) => block.kind)).toEqual([
      'image',
      'audio',
    ]);
  });
});
