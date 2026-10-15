import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEditData } from '../../shared/admin/project';
import type { ApiTokenScope } from '../../shared/api-token';
import { DEFAULT_AI_MODEL } from '../../shared/ai-model';
import { createTheiMcpServer } from '../../server/thei/mcp/server';
import {
  readProjectEdit,
  saveProjectEdit,
} from '../../server/thei/projects/edit';
import { readEventEdit, saveEventEdit } from '../../server/thei/events/edit';
import type { EventEditData } from '../../shared/event';
import { findAction } from '../../server/thei/ai/actions/rows';
import { settleActions } from '../../server/thei/ai/actions/apply';
import { rejectActions } from '../../server/thei/ai/actions/decide';
import { undoState } from '../../server/thei/ai/actions/undo';
import { saveTerm } from '../../server/thei/ai/terms';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * The MCP surface as a client meets it: both protocol eras, the tools a
 * token's scopes allow, and reads that show the owner's archive as it is.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const TAG = 't-22222222-2222-4222-8222-222222222222';

// Each test its own token, so the per-minute budget starts afresh.
let tokenCount = 0;
let tokenUuid = 'tk-0';

beforeEach(async () => {
  tokenUuid = `tk-${++tokenCount}`;
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    version: '0.0.6',
    config: {
      siteUrl: 'https://example.test',
      languageCode: 'en',
      mcp: {
        enabled: true,
        instructions: 'I write "ваще" on purpose.',
        model: { ...DEFAULT_AI_MODEL },
        monthlyTokens: 10_000_000,
      },
    },
    console: { log() {}, warn() {}, error() {} },
    // The admin's own saves, which an editor token goes through.
    ...serverRepositories,
  });
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ app: { baseURL: '/' } }),
  });
  const insert = (table: string, row: Record<string, unknown>) =>
    context.rawDb
      .prepare(
        `INSERT INTO \`${table}\` (${Object.keys(row)
          .map((key) => `\`${key}\``)
          .join(', ')}) VALUES (${Object.keys(row)
          .map(() => '?')
          .join(', ')})`,
      )
      .run(
        ...Object.values(row).map((value) =>
          value !== null && typeof value === 'object'
            ? JSON.stringify(value)
            : value,
        ),
      );
  const text = (blocks: unknown[]) => ({ blocks });
  insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  insert('projects', {
    projectUuid: PROJECT,
    title: 'Parapet',
    summary: 'A browser remake',
    access: 'public',
    humanReadableSlug: 'parapet',
    publicId: 'Parapet',
    createdAt: 1,
    updatedAt: 2,
  });
  insert('content', {
    contentUuid: 'c-1',
    ownerType: 'project',
    ownerId: PROJECT,
    slot: 'project-description',
    data: text([
      {
        type: 'paragraph',
        data: { text: 'Bosses that teleport around the arena' },
      },
    ]),
    createdAt: 1,
    updatedAt: 3,
  });
  insert('tags', {
    tagUuid: TAG,
    title: 'Games',
    normalizedTitle: 'games',
    slug: 'games',
    publicId: 'Games1',
  });
  insert('tag-usages', {
    tagUuid: TAG,
    containerType: 'project',
    containerId: PROJECT,
    sortOrder: 0,
  });
  insert('diary-entries', {
    diaryUuid: 'd-1',
    date: '2026-10-13',
    access: 'public',
    createdAt: 1,
    updatedAt: 4,
  });
  insert('content', {
    contentUuid: 'c-2',
    ownerType: 'diary-entry',
    ownerId: 'd-1',
    slot: 'diary-body',
    data: text([
      {
        type: 'paragraph',
        data: {
          text: `Finished the boss of <a data-content-link="entity" data-entity-type="project" data-entity-id="${PROJECT}">Parapet</a>, it teleports now.`,
        },
      },
    ]),
    createdAt: 1,
    updatedAt: 5,
  });
});

afterEach(async () => {
  await context.close();
});

function handlerFor(scopes: ApiTokenScope[]) {
  return createMcpHandler(() =>
    createTheiMcpServer({
      event: {
        node: { req: { headers: { host: 'example.test' } } },
        context: {},
      } as never,
      principal: { tokenUuid, label: 'Test', scopes },
    }),
  );
}

const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function call(
  handler: ReturnType<typeof handlerFor>,
  method: string,
  params: Record<string, unknown> = {},
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
  };
  if (typeof params.name === 'string') headers['mcp-name'] = params.name;
  const response = await handler.fetch(
    new Request('https://example.test/api/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: { ...params, _meta: META },
      }),
    }),
  );
  return (await response.json()) as {
    result?: Record<string, any>;
    error?: unknown;
  };
}

async function tool(
  handler: ReturnType<typeof handlerFor>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const { result } = await call(handler, 'tools/call', {
    name,
    arguments: args,
  });
  return result as { content: { text: string }[]; isError?: boolean };
}

describe('the MCP endpoint', () => {
  it('serves a client of the 2025 protocol too', async () => {
    const response = await handlerFor(['read']).fetch(
      new Request('https://example.test/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'old', version: '1' },
          },
        }),
      }),
    );
    const body = await response.text();
    expect(body).toContain('"protocolVersion":"2025-06-18"');
    // What the model is told about the site comes with the handshake.
    expect(body).toContain('a mere mention deserves an inline link');
    expect(body).toContain('Call site_overview first');
    // A client shows the site by its own icon.
    expect(body).toContain('"websiteUrl":"https://example.test/"');
    expect(body).toContain('"src":"https://example.test/apple-touch-icon.png"');
  });

  it('offers a reader the reading tools and suggestions, nothing that writes', async () => {
    const { result } = await call(handlerFor(['read']), 'tools/list');
    const tools = result!.tools as {
      name: string;
      annotations?: { readOnlyHint?: boolean };
    }[];
    const reading = [
      'list_entities',
      'site_overview',
      'read_entity',
      'changes_since',
      'search_archive',
      'tag_candidates',
      'life_timeline',
      'read_digests',
      'read_memory',
      'relation_graph',
      'session_actions',
      'describe_actions',
    ];
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(reading));
    // A reader proposes; it never applies or undoes.
    expect(tools.map((t) => t.name)).not.toContain('undo_action');
    for (const listed of tools)
      if (reading.includes(listed.name))
        expect(listed.annotations?.readOnlyHint).toBe(true);
      // Besides reading: proposals, and taking the owner's requests for them.
      else expect(listed.name).toMatch(/^(propose|open_session|write_digest)$/);
  });

  it('reads wide in digests, and the relations as one table', async () => {
    const reader = handlerFor(['read']);
    const digests = (
      await tool(reader, 'read_digests', {
        refs: [`project:${PROJECT}`, 'diary-entry:2026-10-13', 'event:nope'],
      })
    ).content[0]!.text;
    expect(digests).toContain(`project:${PROJECT} — Parapet`);
    expect(digests).toContain('A browser remake — Bosses that teleport');
    expect(digests).toContain('diary-entry:2026-10-13');
    expect(digests).toMatch(/keywords: browser, remake/);
    expect(digests).not.toMatch(/keywords: .*that/);
    expect(digests).toContain('- event:nope — not found');

    expect((await tool(reader, 'relation_graph')).content[0]!.text).toBe(
      'No relations.',
    );
    await tool(handlerFor(['read', 'edit']), 'propose', {
      actions: [
        {
          kind: 'relation',
          target: 'diary-entry:2026-10-13',
          other: `project:${PROJECT}`,
          relation: 'depends-on',
          note: { type: 'shared', text: 'Boss day' },
          reason: 'The boss was finished that day',
          whyNotInlineLink: 'The day is a stage of the work',
        },
      ],
      apply: true,
    });
    expect((await tool(reader, 'relation_graph')).content[0]!.text).toMatch(
      /diary-entry:2026-10-13 "2026-10-13" → depends on → project:\S+ "Parapet" · Boss day/,
    );
  });

  it('tells what the site holds and what the token may do', async () => {
    const result = await tool(handlerFor(['read']), 'site_overview');
    const text = result.content[0]!.text;
    expect(text).toContain('It holds 1 projects, 0 events, 1 diary entries');
    expect(text).toContain('Propose actions to the owner');
    expect(text).toContain('## How the archive is built');
    expect(text).toContain('I write "ваще" on purpose.');
    expect(text).toContain('# How texts are written');
  });

  it('reads a diary entry by its day, with its text as editing Markdown', async () => {
    const result = await tool(handlerFor(['read']), 'read_entity', {
      ref: 'diary-entry:2026-10-13',
    });
    const text = result.content[0]!.text;
    expect(text).toContain('# diary-entry:2026-10-13');
    expect(text).toContain(
      `Finished the boss of [Parapet](thei:project/${PROJECT}), it teleports now.`,
    );
    // Linked, but no relation joins them: the model is shown the difference.
    expect(text).toContain(`- project:${PROJECT} — Parapet`);
    expect(text).not.toContain('(also related)');
  });

  it('reads a project with its tags', async () => {
    const result = await tool(handlerFor(['read']), 'read_entity', {
      ref: `project:${PROJECT}`,
    });
    const text = result.content[0]!.text;
    expect(text).toContain('Bosses that teleport around the arena');
    expect(text).toContain(`- tag:${TAG} — Games`);
    expect(text).toContain(
      'Public: https://example.test/projects/parapet-Parapet/',
    );
  });

  it('refuses a ref it cannot follow, in words a model can act on', async () => {
    const result = await tool(handlerFor(['read']), 'read_entity', {
      ref: 'diary-entry:2026-01-01',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe(
      'There is no diary entry on 2026-01-01.',
    );
  });

  it('finds every form of a word, private notes and diary included', async () => {
    const result = await tool(handlerFor(['read']), 'search_archive', {
      query: 'teleported',
    });
    const text = result.content[0]!.text;
    expect(text).toContain('diary-entry:2026-10-13');
    expect(text).toContain(`project:${PROJECT}`);
  });

  it('lists a kind a page at a time', async () => {
    const result = await tool(handlerFor(['read']), 'list_entities', {
      kind: 'diary-entry',
      withoutRelations: true,
    });
    expect(result.content[0]!.text).toContain('1 in all');
  });
});

/** Proposes actions as a key would; an editor's may apply them at once. */
async function propose(
  handler: ReturnType<typeof handlerFor>,
  actions: Record<string, unknown>[],
  options: { apply?: boolean; atomic?: boolean } = {},
) {
  return (await tool(handler, 'propose', { actions, ...options })).content[0]!
    .text;
}

/** The actions a proposal made, in order. */
const proposedIn = (text: string) =>
  [...text.matchAll(/^- (aia-[\w-]+): proposed$/gm)].map((match) => match[1]!);

const one = (sql: string, ...params: unknown[]) =>
  context.rawDb.prepare(sql).get(...params) as Record<string, any> | undefined;

function bodyOf(day: string) {
  return JSON.parse(
    (
      context.rawDb
        .prepare(
          "SELECT c.data FROM content c JOIN `diary-entries` d ON c.ownerId = d.diaryUuid WHERE d.date = ? AND c.slot = 'diary-body'",
        )
        .get(day) as { data: string }
    ).data,
  );
}

const textVersion = () =>
  (
    context.rawDb
      .prepare("SELECT updatedAt FROM content WHERE contentUuid = 'c-2'")
      .get() as { updatedAt: number }
  ).updatedAt;

describe('proposing over MCP', () => {
  it('offers a reader proposals, and an editor applying and undoing too', async () => {
    const reader = (
      await call(handlerFor(['read']), 'tools/list')
    ).result!.tools.map((t: { name: string }) => t.name);
    expect(reader).toEqual(
      expect.arrayContaining(['read_entity', 'propose', 'describe_actions']),
    );
    expect(reader).not.toContain('undo_action');
    expect(reader).not.toContain('upload_file');
    const editor = handlerFor(['read', 'edit']);
    const names = (await call(editor, 'tools/list')).result!.tools.map(
      (t: { name: string }) => t.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['propose', 'undo_action', 'upload_file']),
    );
    const written = await propose(
      editor,
      [
        {
          kind: 'write',
          target: 'diary-entry:2026-10-13',
          text: 'body',
          mode: 'replace',
          markdown: 'All new.',
          reason: 'Asked to',
        },
      ],
      { apply: true },
    );
    expect(written).toMatch(/Applied: aia-/);
    expect(
      bodyOf('2026-10-13').blocks.map(
        (b: { data: { text: string } }) => b.data.text,
      ),
    ).toEqual(['All new.']);
  });

  it('tells a client of every tool whether it reads, suggests, adds or changes', async () => {
    const tools = (await call(handlerFor(['read', 'edit']), 'tools/list'))
      .result!.tools as {
      name: string;
      annotations: Record<string, boolean>;
    }[];
    const kinds = Object.fromEntries(
      tools.map(({ name, annotations: hint }) => [
        name,
        hint.readOnlyHint
          ? 'reads'
          : hint.destructiveHint
            ? 'changes'
            : hint.idempotentHint
              ? 'suggests'
              : 'adds',
      ]),
    );
    expect(kinds).toEqual({
      site_overview: 'reads',
      search_archive: 'reads',
      list_entities: 'reads',
      read_entity: 'reads',
      changes_since: 'reads',
      read_digests: 'reads',
      read_memory: 'reads',
      write_digest: 'suggests',
      relation_graph: 'reads',
      life_timeline: 'reads',
      tag_candidates: 'reads',
      file_status: 'reads',
      session_actions: 'reads',
      describe_actions: 'reads',
      open_session: 'adds',
      upload_file: 'adds',
      import_file: 'adds',
      reprocess_file: 'adds',
      propose: 'changes',
      undo_action: 'changes',
    });
    const reader = (await call(handlerFor(['read']), 'tools/list')).result!
      .tools as { name: string; annotations: Record<string, boolean> }[];
    // A reader's proposals change nothing: the same twice adds nothing.
    expect(
      reader.find((item) => item.name === 'propose')!.annotations,
    ).toMatchObject({ destructiveHint: false, idempotentHint: true });
    // Nothing is left to a default; only an import reaches past the site.
    for (const { name, annotations: hint } of tools) {
      expect(hint.openWorldHint).toBe(name === 'import_file');
      if (!hint.readOnlyHint)
        expect(Object.keys(hint)).toEqual(
          expect.arrayContaining(['destructiveHint', 'idempotentHint']),
        );
    }
  });

  it('gives a long text in parts, cut between paragraphs', async () => {
    const paragraphs = Array.from(
      { length: 120 },
      (_, index) => `Paragraph ${index}: ${'word '.repeat(60).trim()}.`,
    );
    await propose(
      handlerFor(['read', 'edit']),
      [
        {
          kind: 'write',
          target: 'diary-entry:2026-10-13',
          text: 'body',
          mode: 'replace',
          markdown: paragraphs.join('\n\n'),
        },
      ],
      { apply: true },
    );
    const reader = handlerFor(['read']);
    const whole = (
      await tool(reader, 'read_entity', { ref: 'diary-entry:2026-10-13' })
    ).content[0]!.text;
    const offset = Number(whole.match(/text "body", offset (\d+)/)![1]);
    expect(whole).toContain('Paragraph 0:');
    expect(whole).not.toContain('Paragraph 119:');
    const rest = (
      await tool(reader, 'read_entity', {
        ref: 'diary-entry:2026-10-13',
        text: 'body',
        offset,
      })
    ).content[0]!.text;
    // The cut falls between two paragraphs, none is split or lost.
    const first = Number(rest.match(/^Paragraph (\d+):/m)![1]);
    expect(whole).toContain(`Paragraph ${first - 1}: `);
    expect(whole).not.toContain(`Paragraph ${first}: `);
    expect(rest).toContain('Paragraph 119:');
    expect(rest).not.toContain('continues');
    const unknown = await tool(reader, 'read_entity', {
      ref: 'diary-entry:2026-10-13',
      text: 'preface',
    });
    expect(unknown.content[0]!.text).toContain('has no text "preface"');
  });

  it('proposes a mention as a link, its words kept, until it is one', async () => {
    const reader = handlerFor(['read']);
    const link = (find: string, replace: string) => ({
      find,
      replace,
      category: 'link',
      reason: 'A mere mention',
    });
    const revise = (corrections: unknown[]) => ({
      kind: 'revise',
      target: `project:${PROJECT}`,
      text: 'description',
      mode: 'proofread',
      corrections,
    });
    const refused = await propose(reader, [
      revise([
        link('teleport', '[teleports](thei:diary-entry/2026-10-13)'),
        link('arena', `[arena](thei:project/${PROJECT})`),
        link('Bosses', '[Bosses](https://example.com/)'),
      ]),
    ]);
    expect(refused).toContain('"teleport" → "[teleports]');
    expect(refused).toContain('does not link to its own entity');
    expect(refused.match(/a link keeps every word/g)).toHaveLength(2);

    const [actionUuid] = proposedIn(
      await propose(reader, [
        revise([link('teleport', '[teleport](thei:diary-entry/2026-10-13)')]),
      ]),
    );
    const parts = (findAction(actionUuid!)!.payload as { parts: any[] }).parts;
    // The day is named by its entry's id, ready to be put in.
    expect(parts[0].replaceHtml).toContain(
      'data-entity-type="diary-entry" data-entity-id="d-1">teleport</a>',
    );

    // Once the words are a link, however they became one, the proposal has
    // done its work.
    await propose(
      handlerFor(['read', 'edit']),
      [
        {
          kind: 'write',
          target: `project:${PROJECT}`,
          text: 'description',
          mode: 'replace',
          markdown:
            'Bosses that [teleport](thei:diary-entry/2026-10-13) around the arena',
        },
      ],
      { apply: true },
    );
    const [settled] = await settleActions([findAction(actionUuid!)!]);
    expect(settled!.state).toBe('applied');
  });

  it('links an entity on its first mention, and again only in a part of its own', async () => {
    const editor = handlerFor(['read', 'edit']);
    await propose(
      editor,
      [
        {
          kind: 'write',
          target: 'diary-entry:2026-10-13',
          text: 'body',
          mode: 'replace',
          markdown: [
            `Finished the boss of [Parapet](thei:project/${PROJECT}).`,
            '',
            'Then Parapet ran faster.',
            '',
            '## Later',
            '',
            'Parapet again, on its own.',
          ].join('\n'),
        },
      ],
      { apply: true },
    );
    const link = (find: string, replace: string) => ({
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'proofread',
      corrections: [
        { find, replace, category: 'link', reason: 'A mere mention' },
      ],
    });
    const above = await propose(handlerFor(['read']), [
      link('Then Parapet', `Then [Parapet](thei:project/${PROJECT})`),
    ]);
    expect(above).toContain('linked already above');
    const below = await propose(handlerFor(['read']), [
      link('Parapet again', `[Parapet](thei:project/${PROJECT}) again`),
    ]);
    expect(proposedIn(below)).toHaveLength(1);
  });

  it("leaves the owner's own words alone, but lets them become links", async () => {
    saveTerm({ display: 'teleports' });
    const editor = handlerFor(['read', 'edit']);
    const fixed = await propose(
      editor,
      [
        {
          kind: 'revise',
          target: 'diary-entry:2026-10-13',
          text: 'body',
          mode: 'proofread',
          corrections: [
            { find: 'it teleports now', replace: 'it teleported now' },
          ],
        },
      ],
      { apply: true },
    );
    expect(fixed).toContain(`"teleports" is in the owner's dictionary`);
    const linked = await propose(
      editor,
      [
        {
          kind: 'revise',
          target: 'diary-entry:2026-10-13',
          text: 'body',
          mode: 'proofread',
          corrections: [
            {
              // Parapet is linked in this paragraph already: a tag is not.
              find: 'teleports',
              replace: `[teleports](thei:tag/${TAG})`,
              category: 'link',
            },
          ],
        },
      ],
      { apply: true },
    );
    expect(linked).toMatch(/Applied/);
    expect(JSON.stringify(bodyOf('2026-10-13'))).toContain('>teleports</a>');
  });

  it('shows what waits and what the owner declined, so it is not offered again', async () => {
    const [actionUuid] = proposedIn(
      await propose(handlerFor(['read']), [
        {
          kind: 'note',
          target: 'diary-entry:2026-10-13',
          markdown: 'The boss is done.',
          reason: 'The day says so.',
        },
      ]),
    );
    const read = async () =>
      (
        await tool(handlerFor(['read']), 'read_entity', {
          ref: 'diary-entry:2026-10-13',
        })
      ).content[0]!.text;
    expect(await read()).toContain(
      `- ${actionUuid}: note — Note: The boss is done.`,
    );
    rejectActions([actionUuid!]);
    const after = await read();
    expect(after).not.toContain('## Actions waiting');
    expect(after).toMatch(
      /## Declined by the owner lately\n\n- \d{4}-\d{2}-\d{2}: note — Note: The boss is done\./,
    );
  });

  it('fixes a word, keeps the rest byte for byte, and leaves out a rewrite', async () => {
    const before = bodyOf('2026-10-13');
    const result = await propose(
      handlerFor(['read', 'edit']),
      [
        {
          kind: 'revise',
          target: 'diary-entry:2026-10-13',
          text: 'body',
          mode: 'proofread',
          corrections: [
            { find: 'teleports', replace: 'teleport' },
            {
              find: 'Finished the boss',
              replace: 'Today I finally beat the whole boss',
            },
          ],
        },
      ],
      { apply: true },
    );
    expect(result).toMatch(/left out: .*rephrases rather than fixes/);
    expect(result).toMatch(/Applied/);
    const after = bodyOf('2026-10-13');
    expect(after.blocks[0].data.text).toBe(
      before.blocks[0].data.text.replace('teleports', 'teleport'),
    );
  });

  it('lets an editor fix a project too', async () => {
    const result = await propose(
      handlerFor(['read', 'edit']),
      [
        {
          kind: 'revise',
          target: `project:${PROJECT}`,
          text: 'description',
          mode: 'proofread',
          corrections: [{ find: 'arena', replace: 'arenas' }],
        },
      ],
      { apply: true },
    );
    expect(result).toMatch(/Applied/);
    expect(
      one("SELECT data FROM content WHERE contentUuid = 'c-1'")!.data,
    ).toContain('around the arenas');
  });

  it('creates an entry hidden from visitors, its links checked', async () => {
    const editor = handlerFor(['read', 'edit']);
    const entry = (body: string) => ({
      kind: 'create',
      entity: 'diary-entry',
      fields: { date: '2026-10-14', body },
    });
    expect(
      await propose(editor, [entry('See [it](thei:project/p-nope).')], {
        apply: true,
      }),
    ).toMatch(/lead nowhere/);
    const created = await propose(
      editor,
      [entry('Worked on [yesterday](thei:diary-entry/2026-10-13).')],
      { apply: true },
    );
    expect(created).toMatch(/→ diary-entry:/);
    expect(
      one("SELECT access FROM `diary-entries` WHERE date = '2026-10-14'")
        ?.access,
    ).toBe('private');
    expect(bodyOf('2026-10-14').blocks[0].data.text).toContain(
      'data-entity-id="d-1"',
    );
    expect(await propose(editor, [entry('Twice.')], { apply: true })).toMatch(
      /one a day/,
    );
  });
});

describe('tidying over MCP', () => {
  const helper = () => handlerFor(['read']);
  async function markdownOf(ref: string) {
    const read = await tool(helper(), 'read_entity', { ref });
    return read.content[0]!.text;
  }

  it('says what each text is before the text itself', async () => {
    expect(await markdownOf('diary-entry:2026-10-13')).toMatch(
      /## Text "body" \(version 5\)\nWhat it is: The diary entry of Tuesday 2026-10-13: the owner's own account of that one day/,
    );
    expect(await markdownOf(`project:${PROJECT}`)).toMatch(
      /What it is: The description of the project “Parapet”: the whole project as a visitor first reads it on its page\. Its parts are told in its 0 sections\. Public: anyone may read it\./,
    );
  });

  it('takes a heading and a comment, and refuses a rewrite', async () => {
    const body = (await markdownOf('diary-entry:2026-10-13'))
      .split('\n\n')
      .find((part) => part.startsWith('Finished the boss'))!;
    const order = (markdown: string, expectedVersion = textVersion()) => ({
      kind: 'revise',
      target: 'diary-entry:2026-10-13',
      text: 'body',
      mode: 'order',
      expectedVersion,
      markdown,
      reason: 'A heading for the one topic of the day.',
    });
    const tidied = await propose(helper(), [
      {
        ...order(`## The boss\n\n${body}`),
        comments: [
          {
            quote: 'teleports now',
            kind: 'missing',
            comment: 'How long did it take?',
          },
        ],
      },
    ]);
    const [actionUuid] = proposedIn(tidied);
    const payload = findAction(actionUuid!)!.payload as {
      parts: unknown[];
      plan: { items: unknown[]; comments: unknown[] };
    };
    expect(payload.plan.items).toEqual([
      { type: 'heading', text: 'The boss', level: 2 },
      { type: 'block', from: 0 },
    ]);
    expect(payload.plan.comments).toHaveLength(1);
    expect(payload.parts).toEqual([
      expect.objectContaining({ type: 'heading', text: 'The boss' }),
    ]);

    expect(
      await propose(helper(), [
        order(body.replace('it teleports now', 'and now it teleports')),
      ]),
    ).toMatch(/never rewrites/);
    expect(
      await propose(helper(), [order(`## Boss\n\n${body}`, textVersion() - 1)]),
    ).toMatch(/changed since you read it/);
  });
});

describe('an editor over MCP', () => {
  const editor = () => handlerFor(['read', 'edit']);

  it('keeps what a listed item leaves out, and reads lists as it takes them', async () => {
    // Known already, so saving them asks no site for their titles.
    for (const url of ['https://a.test/', 'https://b.test/', 'https://c.test/'])
      context.rawDb
        .prepare(
          "INSERT INTO `external-links` (url, title, faviconKey, status, touchedAt) VALUES (?, ?, 'none', 'complete', 1)",
        )
        .run(url, url);
    // The owner's own form: links with notes, a relation with a note per side.
    const project = (await THEI_SERVER.projects.findByUuid(PROJECT))!;
    const form = await readProjectEdit(project);
    const saved = await saveProjectEdit(
      PROJECT,
      {
        ...(form as unknown as ProjectEditData),
        externalLinks: [
          { url: 'https://a.test/', note: 'Repository', isPrivate: true },
          { url: 'https://b.test/', note: 'Demo', isPrivate: false },
        ],
        relations: [
          {
            entityType: 'diary-entry',
            entityId: 'd-1',
            type: 'influencing',
            note: {
              type: 'split',
              currentText: 'Built on that day',
              relatedText: 'The day it was built on',
            },
          },
        ],
      },
      { expectedUpdatedAt: form.version },
    );
    expect(saved.type).toBe('success');

    const read = await tool(editor(), 'read_entity', {
      ref: `project:${PROJECT}`,
    });
    expect(read.content[0]!.text).toContain('Repository');
    expect(read.content[0]!.text).toContain('this side: Built on that day');

    expect(
      await propose(
        editor(),
        [
          {
            kind: 'update',
            target: `project:${PROJECT}`,
            changes: {
              links: [{ url: 'https://a.test/' }, { url: 'https://c.test/' }],
              relations: [{ ref: 'diary-entry:2026-10-13' }],
            },
          },
        ],
        { apply: true },
      ),
    ).toMatch(/Applied/);

    const after = await readProjectEdit(
      (await THEI_SERVER.projects.findByUuid(PROJECT))!,
    );
    expect(after.externalLinks).toEqual([
      expect.objectContaining({
        url: 'https://a.test/',
        note: 'Repository',
        isPrivate: true,
      }),
      expect.objectContaining({
        url: 'https://c.test/',
        note: '',
        isPrivate: false,
      }),
    ]);
    expect(after.relations).toEqual([
      expect.objectContaining({
        entityId: 'd-1',
        type: 'influencing',
        note: {
          type: 'split',
          currentText: 'Built on that day',
          relatedText: 'The day it was built on',
        },
      }),
    ]);
  });

  it('makes a project with its tags and relations, and a stage of it', async () => {
    const made = await propose(
      editor(),
      [
        {
          kind: 'create',
          entity: 'project',
          fields: {
            title: 'Thei',
            summary: 'An archive of a life',
            description: 'It keeps **everything**.',
            tags: ['Games'],
            relations: [
              {
                ref: 'diary-entry:2026-10-13',
                kind: 'related',
                note: 'Started that day',
              },
            ],
          },
        },
      ],
      { apply: true },
    );
    const ref = made.match(/project:(p-[\w-]+)/)![0];
    const id = ref.slice('project:'.length);
    expect(
      one('SELECT access, title FROM projects WHERE projectUuid = ?', id),
    ).toEqual({ access: 'private', title: 'Thei' });
    expect(
      one('SELECT tagUuid FROM `tag-usages` WHERE containerId = ?', id)
        ?.tagUuid,
    ).toBe(TAG);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `entity-relations` WHERE firstId = ? OR secondId = ?',
        id,
        id,
      )?.n,
    ).toBe(1);

    const stage = await propose(
      editor(),
      [
        {
          kind: 'create',
          target: ref,
          entity: 'project-section',
          fields: {
            title: 'Prototype',
            body: 'First steps.',
            periods: [{ startDate: '2026-01-01', endDate: '2026-02-01' }],
          },
        },
      ],
      { apply: true },
    );
    const sectionRef = stage.match(/project-section:[\w-]+/)![0];
    const sectionId = sectionRef.slice('project-section:'.length);

    expect(
      await propose(
        editor(),
        [
          {
            kind: 'update',
            target: sectionRef,
            changes: { summary: 'The first build' },
          },
        ],
        { apply: true },
      ),
    ).toMatch(/Applied/);
    expect(
      one(
        'SELECT summary FROM `project-content-sections` WHERE sectionUuid = ?',
        sectionId,
      )?.summary,
    ).toBe('The first build');

    expect(
      await propose(editor(), [
        { kind: 'update', target: ref, changes: { colour: 'red' } },
      ]),
    ).toMatch(/has no field "colour"/);

    const deleteOf = (target: string) => ({
      kind: 'delete',
      target,
      reason: 'Asked to',
    });
    expect(
      await propose(editor(), [deleteOf(sectionRef)], { apply: true }),
    ).toMatch(/Applied/);
    expect(
      one(
        'SELECT sectionUuid FROM `project-content-sections` WHERE sectionUuid = ?',
        sectionId,
      ),
    ).toBeUndefined();
    expect(
      one('SELECT projectUuid FROM projects WHERE projectUuid = ?', id),
    ).toBeDefined();
    expect(await propose(editor(), [deleteOf(ref)], { apply: true })).toMatch(
      /Applied/,
    );
    expect(
      one('SELECT projectUuid FROM projects WHERE projectUuid = ?', id),
    ).toBeUndefined();
    expect(
      one('SELECT tagUuid FROM `tag-usages` WHERE containerId = ?', id),
    ).toBeUndefined();
  });

  it('changes a field and leaves everything else as it was', async () => {
    const before = one(
      'SELECT summary, access, publicId FROM projects WHERE projectUuid = ?',
      PROJECT,
    )!;
    expect(
      await propose(
        editor(),
        [
          {
            kind: 'field',
            target: `project:${PROJECT}`,
            field: 'title',
            value: 'Parapet Remake',
          },
        ],
        { apply: true },
      ),
    ).toMatch(/Applied/);
    expect(
      one(
        'SELECT title, summary, access, publicId FROM projects WHERE projectUuid = ?',
        PROJECT,
      ),
    ).toEqual({ title: 'Parapet Remake', ...before });
    expect(
      one("SELECT data FROM content WHERE contentUuid = 'c-1'")!.data,
    ).toContain('Bosses that teleport');
    expect(
      one('SELECT tagUuid FROM `tag-usages` WHERE containerId = ?', PROJECT)
        ?.tagUuid,
    ).toBe(TAG);
  });

  it('keeps a form read before its change from writing over it', async () => {
    const project = (await THEI_SERVER.projects.findByUuid(PROJECT))!;
    const form = await readProjectEdit(project);
    expect(form.version).toBe(2);

    // Related from the entry's side: the project's form holds its relations
    // whole, and the one read before would drop this one.
    expect(
      await propose(
        editor(),
        [
          {
            kind: 'relation',
            target: 'diary-entry:2026-10-13',
            other: `project:${PROJECT}`,
            relation: 'related',
            reason: 'The boss was finished that day',
            whyNotInlineLink: 'The day is a stage of the work',
          },
        ],
        { apply: true },
      ),
    ).toMatch(/Applied/);

    const stale = await saveProjectEdit(
      PROJECT,
      form as unknown as ProjectEditData,
      { expectedUpdatedAt: form.version },
    );
    expect(stale).toMatchObject({ type: 'error', code: 'changed' });
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `entity-relations` WHERE firstId = ? OR secondId = ?',
        PROJECT,
        PROJECT,
      )?.n,
    ).toBe(1);

    const fresh = await readProjectEdit(
      (await THEI_SERVER.projects.findByUuid(PROJECT))!,
    );
    const saved = await saveProjectEdit(
      PROJECT,
      { ...(fresh as unknown as ProjectEditData), title: 'Parapet II' },
      { expectedUpdatedAt: fresh.version },
    );
    expect(saved.type).toBe('success');
    expect(saved.type === 'success' && saved.version).toBeGreaterThan(
      fresh.version,
    );
  });
});

describe('undoing over MCP', () => {
  const editor = () => handlerFor(['read', 'edit']);
  // Two writes within a millisecond would share a version.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
  async function applied(actions: Record<string, unknown>[]) {
    const text = await propose(editor(), actions, { apply: true });
    expect(text).toMatch(/Applied/);
    await tick();
    return proposedIn(text);
  }
  const undo = async (action: string) =>
    (await tool(editor(), 'undo_action', { action })).content[0]!.text;
  const summaryOf = (value: string) => ({
    kind: 'field',
    target: `project:${PROJECT}`,
    field: 'summary',
    value,
  });

  it('lets one of two undos at once through, and refuses the other', async () => {
    const [actionUuid] = await applied([summaryOf('Raced')]);
    const texts = await Promise.all([undo(actionUuid!), undo(actionUuid!)]);
    expect(texts.filter((text) => /^Undone/.test(text))).toHaveLength(1);
    expect(
      one('SELECT summary FROM projects WHERE projectUuid = ?', PROJECT)
        ?.summary,
    ).toBe('A browser remake');
    expect(findAction(actionUuid!)?.state).toBe('undone');
  });

  it('puts changed fields back, once, and only while nothing changed since', async () => {
    const [both] = await applied([
      {
        kind: 'update',
        target: `project:${PROJECT}`,
        changes: { title: 'Parapet Remake', tags: [] },
      },
    ]);
    expect(await undo(both!)).toMatch(/^Undone/);
    expect(
      one('SELECT title FROM projects WHERE projectUuid = ?', PROJECT)?.title,
    ).toBe('Parapet');
    // The simple tag went with its last use, and comes back by its title.
    expect(
      one(
        'SELECT t.title FROM `tag-usages` u JOIN tags t ON t.tagUuid = u.tagUuid WHERE u.containerId = ?',
        PROJECT,
      )?.title,
    ).toBe('Games');
    expect(await undo(both!)).toMatch(/undone already/);

    const [first] = await applied([summaryOf('First')]);
    // Another field, or a text, changed since: the summary is still as the
    // change left it, and can go back.
    await applied([
      {
        kind: 'field',
        target: `project:${PROJECT}`,
        field: 'title',
        value: 'Later',
      },
    ]);
    await applied([
      {
        kind: 'write',
        target: `project:${PROJECT}`,
        text: 'description',
        mode: 'append',
        markdown: 'One more line.',
      },
    ]);
    expect(await undoState(findAction(first!)!)).toBe('ready');

    // The summary itself changed since: undoing would take that too.
    await applied([summaryOf('Second')]);
    expect(await undoState(findAction(first!)!)).toBe('changed');
    expect(await undo(first!)).toMatch(/changed again since/);
  });

  it('takes back what it made, a section included', async () => {
    const makeJam = async () => {
      const text = await propose(
        editor(),
        [
          {
            kind: 'create',
            entity: 'event',
            fields: {
              title: `Jam ${Math.random()}`,
              summary: 'A game jam',
              body: 'Two days.',
              periods: [{ startDate: '2026-05-01', endDate: '2026-05-02' }],
            },
          },
        ],
        { apply: true },
      );
      await tick();
      return {
        id: text.match(/event:(e-[\w-]+)/)![1]!,
        creation: proposedIn(text)[0]!,
      };
    };
    // What an action did to it after goes with it.
    const first = await makeJam();
    await applied([
      {
        kind: 'field',
        target: `event:${first.id}`,
        field: 'summary',
        value: 'Two days of games',
      },
    ]);
    expect(await undo(first.creation)).toMatch(/^Undone/);
    expect(
      one('SELECT eventUuid FROM events WHERE eventUuid = ?', first.id),
    ).toBeUndefined();

    // The owner's own change since stays: then it is not taken back.
    const second = await makeJam();
    const event = (await THEI_SERVER.events.findByUuid(second.id))!;
    const form = (await readEventEdit(event)) as unknown as EventEditData;
    expect(
      (await saveEventEdit(second.id, { ...form, reminder: 'Mine now' })).type,
    ).toBe('success');
    expect(await undo(second.creation)).toMatch(/changed again since/);
    expect(
      one('SELECT eventUuid FROM events WHERE eventUuid = ?', second.id),
    ).toBeDefined();

    const [stage] = await applied([
      {
        kind: 'create',
        target: `project:${PROJECT}`,
        entity: 'project-section',
        fields: { title: 'Prototype', body: 'First steps.' },
      },
    ]);
    expect(await undo(stage!)).toMatch(/^Undone/);
    expect(
      one(
        'SELECT COUNT(*) AS n FROM `project-content-sections` WHERE projectUuid = ?',
        PROJECT,
      )?.n,
    ).toBe(0);
  });

  it('gives a text its earlier wording back, from the newest change back', async () => {
    const words = () =>
      bodyOf('2026-10-13').blocks.map(
        (block: { data: { text: string } }) => block.data.text,
      );
    const original = words();
    const write = async (markdown: string) =>
      (
        await applied([
          {
            kind: 'write',
            target: 'diary-entry:2026-10-13',
            text: 'body',
            mode: 'replace',
            markdown,
          },
        ])
      )[0]!;
    const first = await write('All new.');
    const second = await write('Newer still.');
    expect(await undoState(findAction(first)!)).toBe('changed');
    expect(await undo(second)).toMatch(/^Undone/);
    expect(words()).toEqual(['All new.']);
    // The text says again what the first change left: it can go back too.
    expect(await undoState(findAction(first)!)).toBe('ready');
    await tick();
    expect(await undo(first)).toMatch(/^Undone/);
    expect(words()).toEqual(original);
  });

  it('undoes a tag change by its fields, and never a deletion', async () => {
    const [described] = await applied([
      {
        kind: 'field',
        target: `tag:${TAG}`,
        field: 'description',
        value: 'Things I played',
      },
    ]);
    expect(await undo(described!)).toMatch(/^Undone/);
    expect(
      one('SELECT description FROM tags WHERE tagUuid = ?', TAG)?.description,
    ).toBe('');

    const [deletion] = await applied([
      { kind: 'delete', target: 'diary-entry:2026-10-13', reason: 'Asked to' },
    ]);
    expect(await undo(deletion!)).toMatch(/final/);
  });
});
