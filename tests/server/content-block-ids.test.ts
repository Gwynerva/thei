import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import { baselineSql } from '../../update/migrations';
import { giveStoredBlockIds } from '../../server/thei/content/block-ids';
import { prepareContentForSave } from '../../server/thei/content/repository';

let rawDb: Database.Database;
let logged: string[];

beforeEach(() => {
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  const db = drizzle(rawDb, { schema });
  Object.assign(globalThis, {
    THEI_SERVER: {
      useDb: () => ({ db, schema, rawDb }),
      language: { slugify: (text: string) => text.toLowerCase() },
      assets: { findByUuid: async () => undefined },
    },
  });
  logged = [];
});

afterEach(() => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
});

function content(contentUuid: string, ownerType: string, blocks: unknown[]) {
  rawDb
    .prepare(
      'INSERT INTO content (contentUuid, ownerType, ownerId, slot, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, 1)',
    )
    .run(
      contentUuid,
      ownerType,
      contentUuid,
      ownerType === 'excerpt' ? 'excerpt-body' : 'event-body',
      JSON.stringify({ blocks }),
    );
}

const stored = (contentUuid: string) => {
  const row = rawDb
    .prepare('SELECT data, updatedAt FROM content WHERE contentUuid = ?')
    .get(contentUuid) as { data: string; updatedAt: number };
  return { ...row, blocks: JSON.parse(row.data).blocks as { id?: string }[] };
};

const run = () =>
  giveStoredBlockIds(
    () => {},
    (message) => logged.push(message),
  );

describe('the block ids task', () => {
  it('gives an id to every stored block that has none, and moves nothing else', async () => {
    content('c-written', 'excerpt', [
      { type: 'paragraph', data: { text: 'One' } },
      { id: 'kept', type: 'paragraph', data: { text: 'Two' } },
    ]);
    content('c-edited', 'excerpt', [
      { id: 'a', type: 'paragraph', data: { text: 'One' } },
    ]);
    const before = stored('c-edited').data;

    expect(await run()).toEqual({ changed: 1, total: 2 });

    const written = stored('c-written');
    expect(written.blocks[0]!.id).toMatch(/^[A-Za-z0-9]{10}$/u);
    expect(written.blocks[1]!.id).toBe('kept');
    expect(written.updatedAt).toBe(1);
    expect(stored('c-edited').data).toBe(before);
    expect(logged).toEqual([]);
  });

  it('remembers a heading by the block it now has', async () => {
    content('c-event', 'event', [
      { type: 'header', data: { text: 'Chapter', level: 2 } },
    ]);
    await run();
    const [block] = stored('c-event').blocks;
    expect(
      rawDb.prepare('SELECT blockId FROM "content-anchors"').all(),
    ).toEqual([{ blockId: block!.id }]);
  });

  it('stores a block as a save stores it, so the same text saved again changes nothing', async () => {
    content('c-written', 'excerpt', [
      { type: 'paragraph', data: { text: 'One' } },
      { type: 'paragraph', data: { text: 'Two' }, tunes: { spoiler: true } },
    ]);
    await run();

    const { blocks } = stored('c-written');
    expect(Object.keys(blocks[0]!)).toEqual(['id', 'type', 'data']);
    expect(Object.keys(blocks[1]!)).toEqual(['id', 'type', 'data', 'tunes']);

    // A form sends back the text it read.
    const prepared = await prepareContentForSave(
      'excerpt' as never,
      'c-written',
      'excerpt-body' as never,
      { data: { blocks } as never },
    );
    expect(prepared).toMatchObject({ type: 'save', changed: false });
  });

  it('tells apart the blocks that repeat an id', async () => {
    content('c-repeated', 'excerpt', [
      { id: 'a', type: 'paragraph', data: { text: 'One' } },
      { id: 'a', type: 'paragraph', data: { text: 'Two' } },
    ]);
    expect(await run()).toEqual({ changed: 1, total: 1 });
    const { blocks, updatedAt } = stored('c-repeated');
    expect(blocks[0]!.id).toBe('a');
    expect(blocks[1]!.id).toMatch(/^[A-Za-z0-9]{10}$/u);
    expect(Object.keys(blocks[1]!)).toEqual(['id', 'type', 'data']);
    expect(updatedAt).toBe(1);
  });

  it('leaves a text it cannot read as it was, says so, and goes on', async () => {
    content('c-1-null', 'excerpt', [null]);
    content('c-2-list', 'excerpt', [{ type: 'list' }]);
    content('c-3-heading', 'event', [{ type: 'header' }]);
    content('c-4-written', 'excerpt', [
      { type: 'paragraph', data: { text: 'One' } },
    ]);
    const before = ['c-1-null', 'c-2-list', 'c-3-heading'].map(
      (id) => stored(id).data,
    );

    const result = await run();

    expect(result.total).toBe(4);
    expect(stored('c-1-null').data).toBe(before[0]);
    expect(stored('c-2-list').data).toBe(before[1]);
    expect(logged).toContain(
      'The text c-1-null could not be read and was left as it was.',
    );
    expect(logged).toContain(
      'The text c-2-list could not be read and was left as it was.',
    );
    // A heading with nothing in it either gets its id or is left whole.
    const heading = stored('c-3-heading');
    if (logged.some((message) => message.includes('c-3-heading')))
      expect(heading.data).toBe(before[2]);
    else expect(heading.blocks[0]!.id).toMatch(/^[A-Za-z0-9]{10}$/u);
    expect(stored('c-4-written').blocks[0]!.id).toMatch(/^[A-Za-z0-9]{10}$/u);
  });

  it('writes nothing when run again', async () => {
    content('c-written', 'excerpt', [
      { type: 'paragraph', data: { text: 'One' } },
    ]);
    await run();
    const once = stored('c-written').data;
    expect(await run()).toEqual({ changed: 0, total: 1 });
    expect(stored('c-written').data).toBe(once);
  });
});
