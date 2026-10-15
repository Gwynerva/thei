import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiTokenScope } from '../../shared/api-token';
import { DEFAULT_AI_MODEL } from '../../shared/ai-model';
import { createTheiMcpServer } from '../../server/thei/mcp/server';
import { applyActions } from '../../server/thei/ai/actions/apply';
import { findAction, sessionActions } from '../../server/thei/ai/actions/rows';
import { APP_SESSION_GAP_MS } from '../../server/thei/ai/sessions/app';
import {
  archiveQuietSessions,
  deleteSession,
  purgeArchivedSessions,
  SESSION_ARCHIVE_MS,
  SESSION_QUIET_MS,
} from '../../server/thei/ai/sessions/lifecycle';
import { postOwnerMessage } from '../../server/thei/ai/sessions/owner';
import { placeAppFile } from '../../server/thei/ai/sessions/files';
import { takeUploadTicket } from '../../server/thei/mcp/files';
import {
  createSession,
  findSession,
  insertMessage,
} from '../../server/thei/ai/sessions/store';
import { listSessions } from '../../server/thei/ai/sessions/view';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * Sessions of apps over MCP: opened or gathered by key and name, proposed
 * into, read back with the owner's word, applied and undone with an
 * editor's key — and sessions' lives: archived when quiet, purged a month
 * later, the files and versions they held let go.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
let tokenCount = 0;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
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
  await context.close();
});

const one = (sql: string, ...params: unknown[]) =>
  context.rawDb.prepare(sql).get(...params) as Record<string, any> | undefined;

function app(scopes: ApiTokenScope[], client = 'Claude Desktop 1.0') {
  const tokenUuid = `tk-${++tokenCount}`;
  const handler = createMcpHandler(() =>
    createTheiMcpServer({
      event: {
        node: { req: { headers: { host: 'example.test' } } },
        context: {},
      } as never,
      principal: { tokenUuid, label: 'Test', scopes },
      client,
    }),
  );
  async function tool(name: string, args: Record<string, unknown> = {}) {
    const response = await handler.fetch(
      new Request('https://example.test/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': name,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': {
                name: 'test',
                version: '1',
              },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
    );
    const { result } = (await response.json()) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    return { text: result.content[0]!.text, isError: result.isError };
  }
  return { tokenUuid, tool };
}

const summaryAction = (value: string) => ({
  kind: 'field',
  target: `project:${PROJECT}`,
  field: 'summary',
  value,
  reason: 'Clearer',
});

const sessionIn = (text: string) => text.match(/ais-[\w-]+/)![0];
const actionsIn = (text: string) =>
  [...text.matchAll(/aia-[\w-]+/g)].map((m) => m[0]);

describe('an app over MCP', () => {
  it('gathers what it proposes by key and name, a new session after quiet', async () => {
    const reader = app(['read']);
    const first = await reader.tool('propose', {
      actions: [summaryAction('One')],
    });
    expect(first.isError).toBeFalsy();
    const sessionUuid = sessionIn(first.text);
    expect(findSession(sessionUuid)).toMatchObject({
      origin: 'app',
      tokenUuid: reader.tokenUuid,
      client: 'Claude Desktop 1.0',
      waiting: 1,
    });
    const second = await reader.tool('propose', {
      actions: [{ ...summaryAction('Two'), target: `project:${PROJECT}` }],
    });
    expect(sessionIn(second.text)).toBe(sessionUuid);

    // Half an hour of quiet, and the next proposal starts afresh.
    context.rawDb
      .prepare(
        'UPDATE `ai-sessions` SET lastActiveAt = ? WHERE sessionUuid = ?',
      )
      .run(Date.now() - APP_SESSION_GAP_MS - 1000, sessionUuid);
    const later = await reader.tool('propose', {
      actions: [summaryAction('Three')],
    });
    expect(sessionIn(later.text)).not.toBe(sessionUuid);
  });

  it('opens a session of its own, and nobody else may propose into it', async () => {
    const reader = app(['read']);
    const opened = await reader.tool('open_session', { title: 'Tidy Parapet' });
    const sessionUuid = sessionIn(opened.text);
    expect(findSession(sessionUuid)?.title).toBe('Tidy Parapet');
    const proposed = await reader.tool('propose', {
      session: sessionUuid,
      actions: [summaryAction('One')],
    });
    expect(sessionIn(proposed.text)).toBe(sessionUuid);
    const other = app(['read']);
    const refused = await other.tool('propose', {
      session: sessionUuid,
      actions: [summaryAction('Two')],
    });
    expect(refused).toMatchObject({
      isError: true,
      text: expect.stringMatching(/no session/),
    });
  });

  it('reads back what became of it, the owner’s comments included', async () => {
    const reader = app(['read']);
    const proposed = await reader.tool('propose', {
      actions: [summaryAction('One'), { kind: 'colour' }],
    });
    expect(proposed.text).toMatch(/colour: refused — There is no action/);
    const [actionUuid] = actionsIn(proposed.text);
    const sessionUuid = sessionIn(proposed.text);
    postOwnerMessage(sessionUuid, {
      text: 'Shorter, please',
      comment: actionUuid,
    });
    const read = await reader.tool('session_actions');
    expect(read.text).toContain(`${actionUuid}: field on project:${PROJECT}`);
    expect(read.text).toContain('owner: Shorter, please');
    expect(read.text).toMatch(/pending \(sure\)/);

    const again = await reader.tool('propose', {
      actions: [{ ...summaryAction('Short'), supersedes: actionUuid }],
    });
    expect(again.isError).toBeFalsy();
    expect(findAction(actionUuid!)?.state).toBe('superseded');
  });

  it('describes the kinds of action, and each in full', async () => {
    const reader = app(['read']);
    const all = await reader.tool('describe_actions');
    expect(all.text).toMatch(/- revise: An edit of the owner’s text/);
    expect(all.text).toMatch(/- delete \(final\):/);
    const one = await reader.tool('describe_actions', { kinds: ['tags'] });
    expect(one.text).toMatch(/## tags/);
    expect(one.text).toMatch(/Fields: \{.*"add"/);
  });

  it('applies with an editor’s key only, and undoes in its own sessions', async () => {
    const reader = app(['read']);
    const refused = await reader.tool('propose', {
      actions: [summaryAction('One')],
      apply: true,
    });
    // A reader is not offered apply at all: it is not part of its schema.
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('A browser remake');
    expect(refused.text).not.toMatch(/Applied/);

    const editor = app(['read', 'edit']);
    const applied = await editor.tool('propose', {
      actions: [summaryAction('Two')],
      apply: true,
    });
    expect(applied.text).toMatch(/Applied: aia-/);
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('Two');
    const [actionUuid] = actionsIn(applied.text);
    expect(findAction(actionUuid!)?.appliedBy).toBe('app');

    const stranger = app(['read', 'edit']);
    expect(
      (await stranger.tool('undo_action', { action: actionUuid })).isError,
    ).toBe(true);
    const undone = await editor.tool('undo_action', { action: actionUuid });
    expect(undone.text).toMatch(/^Undone/);
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('A browser remake');
  });
});

describe('the list of sessions', () => {
  it('filters by origin, waiting and words', async () => {
    await app(['read'], 'Cursor').tool('open_session', {
      title: 'Spelling pass',
    });
    // An app that opened none has its own gathered under its name.
    await app(['read'], 'Zed').tool('propose', {
      actions: [summaryAction('One')],
    });
    const all = listSessions();
    expect(all.sessions.length).toBe(2);
    expect(all.modelReady).toBe(false);
    expect(
      listSessions({ waiting: true }).sessions.map((s) => s.client),
    ).toEqual(['Zed']);
    expect(
      listSessions({ q: 'spelling' }).sessions.map((s) => s.title),
    ).toEqual(['Spelling pass']);
    expect(listSessions({ q: 'cursor' }).sessions).toHaveLength(1);
    expect(listSessions({ origin: 'owner' }).sessions).toHaveLength(0);
  });

  it('finds words in any case and alphabet, in the title or what was said', () => {
    const { db, schema } = THEI_SERVER.useDb();
    const titled = createSession({
      origin: 'owner',
      title: 'Ёлка на Новый год',
    });
    const talked = createSession({ origin: 'owner', title: 'Без слов' });
    insertMessage(db, schema, talked, {
      role: 'model',
      text: 'Вот что я нашёл: [Ёлку](thei:event/e-1) и ЦИТАТУ.',
    });
    const found = (q: string) =>
      listSessions({ q }).sessions.map((session) => session.sessionUuid);
    expect(found('ЁЛКА')).toEqual([titled]);
    expect(found('елка на  новый')).toEqual([titled]);
    expect(found('цитату')).toEqual([talked]);
    expect(found('ёлку')).toEqual([talked]);
    expect(found('nothing of the kind')).toEqual([]);
  });

  it('gathers proposals without a session into the one the app opened lately', async () => {
    const reader = app(['read'], 'Cursor');
    const opened = await reader.tool('open_session', {
      title: 'Spelling pass',
    });
    const proposed = await reader.tool('propose', {
      actions: [summaryAction('One')],
    });
    expect(sessionIn(proposed.text)).toBe(sessionIn(opened.text));
  });
});

describe('the life of a session', () => {
  it('goes to the archive when quiet, and is purged a month later', async () => {
    const editor = app(['read', 'edit']);
    const applied = await editor.tool('propose', {
      actions: [summaryAction('Two')],
      apply: true,
    });
    const sessionUuid = sessionIn(applied.text);
    const waiting = await app(['read']).tool('propose', {
      actions: [summaryAction('Three')],
    });
    const waitingSession = sessionIn(waiting.text);
    const now = Date.now() + SESSION_QUIET_MS + 1000;

    expect(archiveQuietSessions(now)).toBe(1);
    expect(findSession(sessionUuid)?.archivedAt).toBe(now);
    // What still waits for the owner keeps its session in view.
    expect(findSession(waitingSession)?.archivedAt).toBeNull();

    expect(purgeArchivedSessions(now + SESSION_ARCHIVE_MS - 1)).toBe(0);
    expect(purgeArchivedSessions(now + SESSION_ARCHIVE_MS + 1)).toBe(1);
    expect(findSession(sessionUuid)).toMatchObject({
      state: 'closed',
      purgedAt: now + SESSION_ARCHIVE_MS + 1,
    });
    expect(sessionActions(sessionUuid)).toEqual([]);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `ai-messages` WHERE sessionUuid = ?',
        sessionUuid,
      )?.n,
    ).toBe(0);
    // Purged sessions are not listed.
    expect(
      listSessions().sessions.map((session) => session.sessionUuid),
    ).toEqual([waitingSession]);
    // What was applied stays.
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('Two');
  });

  it('keeps a pinned one; an archived one is only read until brought back', async () => {
    const reader = app(['read']);
    const opened = await reader.tool('open_session', { title: 'Keep' });
    const sessionUuid = sessionIn(opened.text);
    context.rawDb
      .prepare('UPDATE `ai-sessions` SET pinned = 1 WHERE sessionUuid = ?')
      .run(sessionUuid);
    const now = Date.now() + SESSION_QUIET_MS + 1000;
    expect(archiveQuietSessions(now)).toBe(0);

    // Gone quiet to the archive: the owner brings it back to write in it,
    // and an app's work in it brings it back by itself.
    context.rawDb
      .prepare(
        'UPDATE `ai-sessions` SET pinned = 0, archivedAt = 1 WHERE sessionUuid = ?',
      )
      .run(sessionUuid);
    expect(() =>
      postOwnerMessage(sessionUuid, { text: 'Still here?' }),
    ).toThrow(/archived/);
    await reader.tool('propose', {
      session: sessionUuid,
      actions: [summaryAction('Back again')],
    });
    expect(findSession(sessionUuid)?.archivedAt).toBeNull();

    // Archived by the owner, it stays so: an app may not go on with it.
    context.rawDb
      .prepare(
        'UPDATE `ai-sessions` SET archivedAt = 2, closedAt = 2 WHERE sessionUuid = ?',
      )
      .run(sessionUuid);
    const refused = await reader.tool('propose', {
      session: sessionUuid,
      actions: [summaryAction('Once more')],
    });
    expect(refused.text).toMatch(/archived the session/);
    expect(findSession(sessionUuid)?.archivedAt).toBe(2);
  });

  it('keeps a file an app brings in the app’s session, until it goes', async () => {
    const editor = app(['read', 'edit']);
    const answer = await editor.tool('upload_file', { name: 'chart.png' });
    const ticket = takeUploadTicket(
      /\/api\/mcp\/upload\/([\w-]+)/.exec(answer.text)![1]!,
    );
    const [session] = listSessions({ tokenUuid: editor.tokenUuid }).sessions;
    expect(ticket?.sessionUuid).toBe(session!.sessionUuid);

    context.rawDb
      .prepare(
        `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt)
         VALUES ('a-chart', 'chart', 'png', 'af-1', 'h1', 'original', '{"type":"original"}', 'image', 10, 1)`,
      )
      .run();
    placeAppFile(ticket!.sessionUuid, 'a-chart');
    const placed = () =>
      context.rawDb
        .prepare(
          "SELECT containerId FROM \"asset-usages\" WHERE assetUuid = 'a-chart' AND containerType = 'ai-session'",
        )
        .all();
    expect(placed()).toEqual([{ containerId: session!.sessionUuid }]);

    deleteSession(session!.sessionUuid);
    expect(placed()).toEqual([]);
  });

  it('applies what an owner applies from an app’s session', async () => {
    const proposed = await app(['read']).tool('propose', {
      actions: [summaryAction('Owner took it')],
    });
    const [actionUuid] = actionsIn(proposed.text);
    const outcome = await applyActions({
      actionUuids: [actionUuid!],
      by: 'owner',
    });
    expect(outcome.applied).toHaveLength(1);
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('Owner took it');
  });
});
