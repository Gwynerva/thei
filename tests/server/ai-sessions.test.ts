import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyActions } from '../../server/thei/ai/actions/apply';
import { findAction, sessionActions } from '../../server/thei/ai/actions/rows';
import {
  archiveQuietSessions,
  deleteSession,
  purgeArchivedSessions,
  SESSION_ARCHIVE_MS,
  SESSION_LEFT_MS,
  SESSION_QUIET_MS,
} from '../../server/thei/ai/sessions/lifecycle';
import { postOwnerMessage } from '../../server/thei/ai/sessions/owner';
import { placeSessionFiles } from '../../server/thei/ai/sessions/files';
import { directTools } from '../../server/thei/mcp/registry';
import {
  createSession,
  findSession,
  insertMessage,
} from '../../server/thei/ai/sessions/store';
import {
  aiWaiting,
  listSessions,
  sessionOverview,
} from '../../server/thei/ai/sessions/view';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

/**
 * Sessions of Thei's own model: proposed into, read back with the owner's
 * word, listed — and their lives: archived when quiet, purged a month
 * later, the files and versions they held let go. An app over MCP has none.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  context = await freshAiTestDb();
  context.insert('profiles', { profileId: 'profile', displayName: 'Owner' });
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

/** Thei's own model, at work in a session: its tools as it calls them. */
function model(sessionUuid = createSession({ origin: 'owner' })) {
  const tools = directTools({
    event: {
      node: { req: { headers: { host: 'example.test' } } },
      context: {},
    } as never,
    principal: {
      tokenUuid: `thei:${sessionUuid}`,
      label: 'Thei',
      scopes: ['read'],
    },
    session: {
      sessionUuid,
      messageUuid: 'am-1',
      live: () => true,
      signal: new AbortController().signal,
    },
  });
  async function tool(name: string, args: Record<string, unknown> = {}) {
    const result = (await tools
      .find((item) => item.name === name)!
      .call(args)) as { content: { text: string }[]; isError?: boolean };
    return { text: result.content[0]!.text, isError: result.isError };
  }
  return { sessionUuid, tool };
}

const summaryAction = (value: string) => ({
  kind: 'field',
  target: `project:${PROJECT}`,
  field: 'summary',
  value,
  reason: 'Clearer',
});

const actionsIn = (text: string) =>
  [...text.matchAll(/aia-[\w-]+/g)].map((m) => m[0]);

describe('the site’s model in a session', () => {
  it('reads back what became of it, the owner’s comments included', async () => {
    const { sessionUuid, tool } = model();
    const proposed = await tool('propose', {
      actions: [summaryAction('One'), { kind: 'colour' }],
    });
    expect(proposed.text).toMatch(/colour: refused — There is no action/);
    const [actionUuid] = actionsIn(proposed.text);
    const { db, schema } = THEI_SERVER.useDb();
    insertMessage(db, schema, sessionUuid, {
      role: 'owner',
      text: 'Shorter, please',
      parts: [{ type: 'comment', actionUuid: actionUuid! }],
    });
    const read = await tool('session_actions');
    expect(read.text).toContain(`${actionUuid}: field on project:${PROJECT}`);
    expect(read.text).toContain('owner: Shorter, please');
    expect(read.text).toMatch(/pending \(sure\)/);

    const again = await tool('propose', {
      actions: [{ ...summaryAction('Short'), supersedes: actionUuid }],
    });
    expect(again.isError).toBeFalsy();
    expect(findAction(actionUuid!)?.state).toBe('superseded');
  });

  it('describes the kinds of action, and each in full', async () => {
    const { tool } = model();
    const all = await tool('describe_actions');
    expect(all.text).toMatch(/- revise: An edit of the owner’s text/);
    expect(all.text).toMatch(/- delete \(final\):/);
    const one = await tool('describe_actions', { kinds: ['tags'] });
    expect(one.text).toMatch(/## tags/);
    expect(one.text).toMatch(/Fields: \{.*"add"/);
  });
});

describe('the list of sessions', () => {
  it('filters by origin, waiting and words', async () => {
    createSession({ origin: 'template', title: 'Spelling pass' });
    await model(createSession({ origin: 'owner', title: 'Summaries' })).tool(
      'propose',
      { actions: [summaryAction('One')] },
    );
    const all = listSessions();
    expect(all.sessions.length).toBe(2);
    expect(all.modelReady).toBe(false);
    expect(
      listSessions({ waiting: true }).sessions.map((s) => s.title),
    ).toEqual(['Summaries']);
    expect(
      listSessions({ q: 'spelling' }).sessions.map((s) => s.title),
    ).toEqual(['Spelling pass']);
    expect(listSessions({ origin: 'owner' }).sessions).toHaveLength(1);
  });

  it('never shows the container of an app’s direct write', async () => {
    const container = createSession({ origin: 'app' });
    await model(container).tool('propose', {
      actions: [summaryAction('Between check and apply')],
    });
    expect(listSessions().sessions).toEqual([]);
    expect(listSessions({ origin: 'app' }).sessions).toEqual([]);
    expect(aiWaiting()).toBe(0);
    expect(sessionOverview().total).toBe(0);
  });

  it('gives the dashboard a few that wait, work and were done this week', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const session = (
      title: string,
      set: {
        state?: string;
        waiting?: number;
        ago?: number;
        archived?: boolean;
      },
    ) => {
      const sessionUuid = createSession({ origin: 'owner', title });
      const at = Date.now() - (set.ago ?? 0);
      context.rawDb
        .prepare(
          'UPDATE "ai-sessions" SET state = ?, waiting = ?, lastActiveAt = ?, archivedAt = ? WHERE sessionUuid = ?',
        )
        .run(
          set.state ?? 'idle',
          set.waiting ?? 0,
          at,
          set.archived ? at : null,
          sessionUuid,
        );
    };
    // What waits shows however old it is; one at work shows as working, what
    // waits in it too; the archive and what was done before the week, never.
    session('Old question', { waiting: 1, ago: 30 * DAY });
    session('Working', { state: 'running', waiting: 2 });
    for (const day of [1, 2, 3, 4]) session(`Done ${day}`, { ago: day * DAY });
    session('Done long ago', { ago: 10 * DAY });
    session('Archived', { waiting: 1, archived: true });
    const titles = (items: { title: string }[]) =>
      items.map((item) => item.title);
    const overview = sessionOverview();
    expect(overview.total).toBe(7);
    expect(titles(overview.waiting)).toEqual(['Old question']);
    expect(titles(overview.running)).toEqual(['Working']);
    // What the others leave, the done ones take.
    expect(titles(overview.recent)).toEqual([
      'Done 1',
      'Done 2',
      'Done 3',
      'Done 4',
    ]);
    // Little room is shared evenly; a short kind leaves the rest to others.
    const small = sessionOverview(5);
    expect(titles(small.waiting)).toEqual(['Old question']);
    expect(titles(small.running)).toEqual(['Working']);
    expect(titles(small.recent)).toEqual(['Done 1', 'Done 2', 'Done 3']);
    const tiny = sessionOverview(2);
    expect(
      [tiny.waiting, tiny.running, tiny.recent].map((list) => list.length),
    ).toEqual([1, 1, 0]);
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
    // What was said in one session finds that one alone.
    insertMessage(db, schema, titled, { role: 'owner', text: 'Совсем другое' });
    const found = (q: string) =>
      listSessions({ q }).sessions.map((session) => session.sessionUuid);
    // Every form of a word finds the word, and words are found apart.
    expect(found('ЁЛКА').sort()).toEqual([titled, talked].sort());
    expect(found('ёлку').sort()).toEqual([titled, talked].sort());
    expect(found('елка на  новый')).toEqual([titled]);
    expect(found('новый ёлка')).toEqual([titled]);
    expect(found('цитату')).toEqual([talked]);
    expect(found('нашел цитата')).toEqual([talked]);
    // Never inside another word.
    expect(found('итат')).toEqual([]);
    expect(found('nothing of the kind')).toEqual([]);
  });

  it('pages on without skipping sessions touched in one moment', () => {
    const at = (sessionUuid: string, lastActiveAt: number) =>
      context.rawDb
        .prepare(
          'UPDATE `ai-sessions` SET lastActiveAt = ? WHERE sessionUuid = ?',
        )
        .run(lastActiveAt, sessionUuid);
    const made: string[] = [];
    const session = (lastActiveAt: number) => {
      const sessionUuid = createSession({ origin: 'owner', title: 'S' });
      at(sessionUuid, lastActiveAt);
      made.push(sessionUuid);
    };
    // A page's edge falls among thirty sessions an apply touched at once.
    for (let index = 0; index < 40; index++) session(10_000 + index);
    for (let index = 0; index < 30; index++) session(5000);
    for (let index = 0; index < 5; index++) session(100 + index);

    const first = listSessions();
    expect(first.sessions).toHaveLength(70);
    expect(first.next).toBe(5000);
    const second = listSessions({ before: first.next });
    expect(second.sessions).toHaveLength(5);
    expect(second.next).toBeUndefined();
    expect(
      new Set(
        [...first.sessions, ...second.sessions].map((item) => item.sessionUuid),
      ),
    ).toEqual(new Set(made));
  });
});

describe('the life of a session', () => {
  it('goes to the archive when quiet, and is purged a month later', async () => {
    const done = model();
    const applied = await done.tool('propose', {
      actions: [summaryAction('Two')],
    });
    await applyActions({ actionUuids: actionsIn(applied.text), by: 'owner' });
    const sessionUuid = done.sessionUuid;
    const waiting = model();
    await waiting.tool('propose', { actions: [summaryAction('Three')] });
    const waitingSession = waiting.sessionUuid;
    const now = Date.now() + SESSION_QUIET_MS + 1000;

    expect(archiveQuietSessions(now)).toBe(1);
    expect(findSession(sessionUuid)?.archivedAt).toBe(now);
    // What still waits for the owner keeps its session in view.
    expect(findSession(waitingSession)?.archivedAt).toBeNull();

    expect(purgeArchivedSessions(now + SESSION_ARCHIVE_MS - 1)).toBe(0);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `ai-session-entities` WHERE sessionUuid = ?',
        sessionUuid,
      )?.n,
    ).toBeGreaterThan(0);
    expect(purgeArchivedSessions(now + SESSION_ARCHIVE_MS + 1)).toBe(1);
    // Purged, it is deleted whole, the entities it concerned with it.
    expect(findSession(sessionUuid)).toBeUndefined();
    expect(sessionActions(sessionUuid)).toEqual([]);
    for (const table of ['ai-messages', 'ai-session-entities'])
      expect(
        one(
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE sessionUuid = ?`,
          sessionUuid,
        )?.n,
      ).toBe(0);
    expect(
      listSessions().sessions.map((session) => session.sessionUuid),
    ).toEqual([waitingSession]);
    // What was applied stays.
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('Two');
  });

  it('archives a session left a month with things waiting, which then count nowhere', async () => {
    const { sessionUuid, tool } = model();
    await tool('propose', { actions: [summaryAction('Three')] });
    expect(listSessions().waiting).toBe(1);
    expect(archiveQuietSessions(Date.now() + SESSION_LEFT_MS - 1000)).toBe(0);

    const later = Date.now() + SESSION_LEFT_MS + 1000;
    expect(archiveQuietSessions(later)).toBe(1);
    expect(findSession(sessionUuid)).toMatchObject({
      archivedAt: later,
      waiting: 1,
    });
    expect(listSessions().waiting).toBe(0);
    // And it goes as any archived session goes, what waited in it too.
    expect(purgeArchivedSessions(later + SESSION_ARCHIVE_MS + 1)).toBe(1);
    expect(findSession(sessionUuid)).toBeUndefined();
  });

  it('keeps a pinned one; an archived one is only read until brought back', async () => {
    const sessionUuid = createSession({ origin: 'owner', title: 'Keep' });
    context.rawDb
      .prepare('UPDATE `ai-sessions` SET pinned = 1 WHERE sessionUuid = ?')
      .run(sessionUuid);
    const now = Date.now() + SESSION_QUIET_MS + 1000;
    expect(archiveQuietSessions(now)).toBe(0);

    // Gone quiet to the archive: the owner brings it back to write in it.
    context.rawDb
      .prepare(
        'UPDATE `ai-sessions` SET pinned = 0, archivedAt = 1 WHERE sessionUuid = ?',
      )
      .run(sessionUuid);
    expect(() =>
      postOwnerMessage(sessionUuid, { text: 'Still here?' }),
    ).toThrow(/archived/);
  });

  it('keeps a file brought into a session, until the session goes', async () => {
    const sessionUuid = createSession({ origin: 'owner' });
    context.rawDb
      .prepare(
        `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, settings, type, size, touchedAt)
         VALUES ('a-chart', 'chart', 'png', 'af-1', 'h1', 'original', '{"type":"original"}', 'image', 10, 1)`,
      )
      .run();
    const { db, schema } = THEI_SERVER.useDb();
    db.transaction((tx) =>
      placeSessionFiles(tx, schema, sessionUuid, ['a-chart'], Date.now()),
    );
    const placed = () =>
      context.rawDb
        .prepare(
          "SELECT containerId FROM \"asset-usages\" WHERE assetUuid = 'a-chart' AND containerType = 'ai-session'",
        )
        .all();
    expect(placed()).toEqual([{ containerId: sessionUuid }]);

    deleteSession(sessionUuid);
    expect(placed()).toEqual([]);
  });

  it('applies what the owner applies of the model’s proposals', async () => {
    const proposed = await model().tool('propose', {
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
