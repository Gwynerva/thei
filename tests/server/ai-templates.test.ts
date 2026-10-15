import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { H3Event } from 'h3';
import { DEFAULT_AI_MODEL } from '../../shared/ai-model';
import type { AiMessagePart } from '../../shared/ai';
import { builtinTemplateId } from '../../shared/ai-template';
import {
  sessionMessages,
  findSession,
} from '../../server/thei/ai/sessions/store';
import { listSessions } from '../../server/thei/ai/sessions/view';
import { turnsSettled } from '../../server/thei/ai/runner/queue';
import {
  checkedSchedule,
  nextRunAt,
} from '../../server/thei/ai/templates/schedule';
import {
  copyTemplate,
  deleteTemplate,
  dueTemplates,
  findTemplate,
  listTemplates,
  saveTemplate,
} from '../../server/thei/ai/templates/store';
import { marksOf } from '../../server/thei/ai/templates/reads';
import {
  runDueTemplates,
  runTemplate,
} from '../../server/thei/ai/templates/run';
import { entityFingerprint } from '../../server/thei/ai/digests';
import { setTheiConfig, theiConfig } from '../../server/thei/config/index';
import { directTools } from '../../server/thei/mcp/registry';
import { invalidateMcpDocuments } from '../../server/thei/mcp/documents';
import {
  startFakeModel,
  type FakeModel,
  type FakeScript,
} from '../helpers/fake-model';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * Templates: built-in ones the owner only schedules and switches, the
 * owner's own, a schedule kept as the next moment in the owner's time zone,
 * and a run whose model takes from the request what to read — told what
 * changed since the run before, and reading of an entity it read then only
 * what changed, kept as read once its turn went through.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;
let folder: string;
let model: FakeModel | undefined;

const DIARY = 'd-1';
const DAY = '2026-10-13';
const PARAGRAPHS = [
  'Went to the Kuzova islands with Lyosha today.',
  'The boat left at nine; the sea was calm all the way.',
  'On the way back we saw seals on the rocks.',
];

function config(modelUrl?: string) {
  setTheiConfig({
    version: '0.0.6',
    siteUrl: 'https://example.test',
    languageCode: 'en',
    mcp: {
      enabled: true,
      instructions: '',
      model: modelUrl
        ? {
            provider: 'openai',
            apiKey: '',
            baseUrl: modelUrl,
            model: 'fake-small',
          }
        : { ...DEFAULT_AI_MODEL },
      monthlyTokens: 10_000_000,
    },
  } as never);
}

async function useModel(script: FakeScript) {
  model = await startFakeModel(script);
  config(model.url);
}

function writeDiary(paragraphs: string[], at: number) {
  context.rawDb
    .prepare('UPDATE content SET data = ?, updatedAt = ? WHERE contentUuid = ?')
    .run(
      JSON.stringify({
        blocks: paragraphs.map((text, index) => ({
          id: `b${index}`,
          type: 'paragraph',
          data: { text },
        })),
      }),
      at,
      'c-1',
    );
  context.rawDb
    .prepare('UPDATE `diary-entries` SET updatedAt = ? WHERE diaryUuid = ?')
    .run(at, DIARY);
  invalidateMcpDocuments();
}

beforeEach(async () => {
  context = await freshTestDb();
  folder = await mkdtemp(join(tmpdir(), 'thei-ai-templates-'));
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    contentPath: (...parts: string[]) => join(folder, ...parts),
    console: {
      log() {},
      warn() {},
      error() {},
      tag: () => ({ log() {}, warn() {}, error() {} }),
    },
    ...serverRepositories,
  });
  config();
  Object.defineProperty(context.server, 'config', {
    configurable: true,
    get: () => theiConfig,
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
      "INSERT INTO `diary-entries` (diaryUuid, date, access, createdAt, updatedAt) VALUES (?, ?, 'public', 1, 4)",
    )
    .run(DIARY, DAY);
  context.rawDb
    .prepare(
      "INSERT INTO content (contentUuid, ownerType, ownerId, slot, data, createdAt, updatedAt) VALUES ('c-1', 'diary-entry', ?, 'diary-body', '{}', 1, 4)",
    )
    .run(DIARY);
  writeDiary(PARAGRAPHS, 5);
});

afterEach(async () => {
  await turnsSettled();
  await model?.close();
  model = undefined;
  await context.close();
  await rm(folder, { recursive: true, force: true });
});

function diaryTemplate(schedule: unknown = { kind: 'manual' }) {
  return saveTemplate(null, {
    title: 'Diary look',
    instruction: 'Proofread the diary entries changed since last time.',
    schedule,
  });
}

async function toolText(name: string, args: unknown) {
  const tool = directTools({
    event: {} as H3Event,
    principal: { tokenUuid: 'tk-test', label: 'Test', scopes: ['read'] },
  }).find((item) => item.name === name)!;
  const result = await tool.call(args);
  return result.content
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
}

function asked(index: number) {
  return JSON.stringify(model!.requests[index]!.body.messages);
}

function templatePart(sessionUuid: string) {
  return sessionMessages(sessionUuid)
    .flatMap((message) => message.parts as AiMessagePart[])
    .find((part) => part.type === 'template') as Extract<
    AiMessagePart,
    { type: 'template' }
  >;
}

const READ_DIARY = {
  toolCalls: [{ name: 'read_entity', input: { ref: `diary-entry:${DAY}` } }],
};

describe('a schedule', () => {
  const at = (iso: string) => Date.parse(iso);

  it('is a time of day in the owner’s time zone', () => {
    const daily = {
      kind: 'day',
      time: '09:00',
      timeZone: 'Europe/Moscow',
    } as const;
    // 08:00 in Moscow: today's run is still ahead.
    expect(nextRunAt(daily, at('2026-10-15T05:00:00Z'))).toBe(
      at('2026-10-15T06:00:00Z'),
    );
    // 10:00 in Moscow: tomorrow's.
    expect(nextRunAt(daily, at('2026-10-15T07:00:00Z'))).toBe(
      at('2026-10-16T06:00:00Z'),
    );
  });

  it('runs on its day of the week and on the first of the month', () => {
    // 15 October 2026 is a Thursday; the Monday after is the 19th.
    expect(
      nextRunAt(
        { kind: 'week', day: 1, time: '20:00', timeZone: 'UTC' },
        at('2026-10-15T12:00:00Z'),
      ),
    ).toBe(at('2026-10-19T20:00:00Z'));
    // New York leaves summer time at 02:00 on 1 November 2026: 03:00 that
    // day is five hours behind UTC, not four.
    expect(
      nextRunAt(
        { kind: 'month', time: '03:00', timeZone: 'America/New_York' },
        at('2026-10-15T12:00:00Z'),
      ),
    ).toBe(at('2026-11-01T08:00:00Z'));
  });

  it('has no next run when it is manual, and is checked as it comes', () => {
    expect(nextRunAt({ kind: 'manual' }, Date.now())).toBeNull();
    expect(() => checkedSchedule({ kind: 'day', time: '25:00' })).toThrow();
    expect(() =>
      checkedSchedule({ kind: 'week', day: 8, time: '10:00' }),
    ).toThrow();
    expect(
      checkedSchedule({ kind: 'day', time: '07:30', timeZone: 'Nowhere/Land' }),
    ).toEqual({ kind: 'day', time: '07:30', timeZone: 'UTC' });
  });
});

describe('the templates', () => {
  it('lists the built-in ones off, and keeps only their settings', () => {
    const builtins = listTemplates().filter((item) => item.builtin);
    expect(builtins.length).toBeGreaterThan(0);
    expect(builtins.every((item) => !item.enabled)).toBe(true);

    const id = builtinTemplateId('nightly');
    const before = findTemplate(id)!;
    const now = Date.parse('2026-10-15T12:00:00Z');
    const saved = saveTemplate(
      id,
      {
        title: 'Renamed',
        enabled: true,
        schedule: { kind: 'day', time: '03:00', timeZone: 'UTC' },
      },
      now,
    );
    // Its words are the code's; its switch and schedule the owner's.
    expect(saved.title).toBe(before.title);
    expect(saved.enabled).toBe(true);
    expect(saved.nextRunAt).toBe(Date.parse('2026-10-16T03:00:00Z'));
    expect(dueTemplates(Date.parse('2026-10-16T03:00:00Z'))).toHaveLength(1);
    expect(() => deleteTemplate(id)).toThrow();
  });

  it('makes the owner’s own, and copies any of them off', () => {
    const own = diaryTemplate();
    expect(own.builtin).toBeUndefined();
    expect(own.enabled).toBe(true);
    const copy = copyTemplate(builtinTemplateId('graph'));
    expect(copy.builtin).toBeUndefined();
    expect(copy.enabled).toBe(false);
    expect(copy.title).toContain(
      findTemplate(builtinTemplateId('graph'))!.title,
    );
    deleteTemplate(copy.templateId);
    expect(findTemplate(copy.templateId)).toBeUndefined();
  });
});

describe('a run', () => {
  it('reads what the request asks, and next time only what changed', async () => {
    const template = diaryTemplate();
    await useModel([
      READ_DIARY,
      { text: 'Proofread it; nothing to fix.' },
      { toolCalls: [{ name: 'changes_since', input: {} }] },
      {
        toolCalls: [
          {
            name: 'read_entity',
            input: { ref: `diary-entry:${DAY}`, since: template.templateId },
          },
        ],
      },
      { text: 'Proofread what changed; nothing to fix.' },
    ]);

    const first = await runTemplate(template.templateId);
    await turnsSettled();
    const session = findSession(first.sessionUuid)!;
    expect(session.origin).toBe('template');
    expect(session.templateId).toBe(template.templateId);
    expect(templatePart(first.sessionUuid)).toMatchObject({ by: 'owner' });
    expect(templatePart(first.sessionUuid).since).toBeUndefined();
    expect(asked(0)).toContain('The template has not run before.');
    expect(asked(0)).toContain('in the owner’s time zone (UTC)');
    expect(asked(0)).toContain('Proofread the diary entries changed');
    // What its model read in full is the template's once the turn is through.
    const key = { kind: 'diary-entry' as const, id: DIARY, date: DAY };
    expect(
      marksOf(template.templateId).get(`diary-entry:${DIARY}`),
    ).toMatchObject({ fingerprint: entityFingerprint(key) });
    const ranAt = findTemplate(template.templateId)!.lastRunAt!;

    // One paragraph changes; the next run hears of it and reads only it.
    writeDiary(
      [PARAGRAPHS[0]!, PARAGRAPHS[1]!, 'On the way back we saw a seal pup.'],
      Date.now() + 1000,
    );
    const second = await runTemplate(template.templateId);
    await turnsSettled();
    expect(templatePart(second.sessionUuid).since).toBe(ranAt);
    expect(asked(2)).toContain('Since then the archive changed: 1 diary entry');
    expect(asked(3)).toContain('read by this template before, changed since');
    expect(asked(4)).toContain('a seal pup');
    expect(asked(4)).toContain(PARAGRAPHS[1]);
    expect(asked(4)).not.toContain('Went to the Kuzova');
    expect(
      marksOf(template.templateId).get(`diary-entry:${DIARY}`),
    ).toMatchObject({ fingerprint: entityFingerprint(key) });
    expect(
      listSessions({ templateId: template.templateId }).sessions.map(
        (item) => item.sessionUuid,
      ),
    ).toEqual([second.sessionUuid, first.sessionUuid]);
  });

  it('keeps nothing it read when the turn failed', async () => {
    await useModel([READ_DIARY, { error: { status: 401 } }]);
    const template = diaryTemplate();
    await runTemplate(template.templateId);
    await turnsSettled();
    expect(marksOf(template.templateId).size).toBe(0);
  });

  it('puts a scheduled run that left nothing to decide into the archive', async () => {
    await useModel([
      { text: 'Nothing changed: nothing to do.' },
      { text: 'Nothing changed: nothing to do.' },
    ]);
    const template = diaryTemplate();
    const scheduled = await runTemplate(template.templateId, {
      by: 'schedule',
    });
    await turnsSettled();
    expect(findSession(scheduled.sessionUuid)!.archivedAt).toBeTruthy();
    // Started by the owner, it stays in sight: they asked for the answer.
    const own = await runTemplate(template.templateId);
    await turnsSettled();
    expect(findSession(own.sessionUuid)!.archivedAt).toBeFalsy();
  });

  it('skips a run that cannot happen without moving «since»', async () => {
    const template = diaryTemplate({
      kind: 'day',
      time: '03:00',
      timeZone: 'UTC',
    });
    // No model is set up: the run is skipped, and only the next one moves.
    await runDueTemplates(template.nextRunAt!);
    const after = findTemplate(template.templateId)!;
    expect(after.lastRunAt).toBeUndefined();
    expect(after.nextRunAt).toBeGreaterThan(template.nextRunAt!);
  });
});

describe('gathering what a request names', () => {
  it('finds the diary of a week by its days, in the owner’s time zone', async () => {
    const template = saveTemplate(null, {
      title: 'Diary week',
      instruction: 'Read the diary entries of the last week.',
      schedule: { kind: 'manual' },
    });
    await useModel([
      {
        toolCalls: [
          {
            name: 'list_entities',
            input: {
              kind: 'diary-entry',
              from: '2026-10-08',
              to: '2026-10-14',
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            name: 'list_entities',
            input: {
              kind: 'diary-entry',
              from: '2026-10-14',
              to: '2026-10-20',
            },
          },
        ],
      },
      { text: 'Read the week.' },
    ]);
    // 23:30 in UTC on the 14th is already the 15th in Moscow.
    await runTemplate(template.templateId, {
      now: Date.parse('2026-10-14T23:30:00Z'),
      timeZone: 'Europe/Moscow',
    });
    await turnsSettled();
    expect(asked(0)).toContain(
      'Today is 2026-10-15 in the owner’s time zone (Europe/Moscow).',
    );
    expect(asked(0)).toContain('list_entities with its kind, from and to');
    expect(asked(1)).toContain(`diary-entry:${DAY}`);
    expect(asked(2)).toContain('0 in all');
  });
});

describe('what changed', () => {
  it('lists what was made or changed from a moment on', async () => {
    expect(await toolText('changes_since', {})).toContain('Name from');
    const listed = await toolText('changes_since', { from: '1970-01-01' });
    expect(listed).toContain(`diary-entry:${DAY}`);
    const none = await toolText('changes_since', {
      from: '1970-01-01',
      kinds: ['project'],
    });
    expect(none).toContain('_(nothing)_');
  });
});
