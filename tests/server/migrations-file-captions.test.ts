import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fileCaptions from '../../update/migrations/0.0.6-file-captions';
import { contentPlainText } from '../../shared/content';
import { schema_0_0_5 } from './fixtures/schema-0.0.5';

/**
 * A 0.0.5 site's recordings and files had plain captions. Read as markup from
 * now on, each must keep the very words it had, `<` and `&` included, in the
 * text and in its kept drafts and versions alike.
 */

let rawDb: Database.Database;

beforeEach(() => {
  rawDb = new Database(':memory:');
  for (const statement of schema_0_0_5) rawDb.prepare(statement).run();
});

afterEach(() => rawDb.close());

const blocks = [
  {
    id: 'a',
    type: 'contentAttachment',
    data: {
      asset: { assetUuid: 'a-1' },
      title: 'Prices',
      caption: 'Q1 < Q2 & <b>not bold</b>',
    },
  },
  {
    id: 'r',
    type: 'contentAudio',
    data: { asset: { assetUuid: 'a-2' }, caption: 'Tom & Jerry' },
  },
  {
    id: 'm',
    type: 'contentMedia',
    data: {
      asset: { assetUuid: 'a-3' },
      layout: 'centered',
      caption: '<b>Already</b> markup &amp; kept',
    },
  },
  { id: 'p', type: 'paragraph', data: { text: 'a &lt; b' } },
];

function seed() {
  rawDb
    .prepare(
      'INSERT INTO `content` (`contentUuid`, `ownerType`, `ownerId`, `slot`, `data`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, 1, 1)',
    )
    .run('c-1', 'event', 'e-1', 'event-body', JSON.stringify({ blocks }));
  rawDb
    .prepare(
      'INSERT INTO `content-history` (`id`, `ownerType`, `ownerRef`, `slot`, `kind`, `data`, `digest`, `wordCount`, `blockCount`, `assetCount`, `size`, `assetUuids`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 1, 1)',
    )
    .run(
      'h-1',
      'event',
      'e-1',
      'event-body',
      'draft',
      JSON.stringify({ blocks }),
      'digest',
      '[]',
    );
  rawDb
    .prepare(
      'INSERT INTO `content` (`contentUuid`, `ownerType`, `ownerId`, `slot`, `data`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, 1, 1)',
    )
    .run(
      'c-2',
      'event',
      'e-2',
      'event-body',
      JSON.stringify({
        blocks: [
          {
            type: 'contentAttachment',
            data: { asset: { assetUuid: 'a-4' }, caption: 'Plain words' },
          },
        ],
      }),
    );
}

const stored = (table: 'content' | 'content-history', key: string) =>
  JSON.parse(
    (
      rawDb
        .prepare(
          `SELECT \`data\` FROM \`${table}\` WHERE \`${table === 'content' ? 'contentUuid' : 'id'}\` = ?`,
        )
        .get(key) as { data: string }
    ).data,
  );

function migrate() {
  const logged: string[] = [];
  fileCaptions.up!({
    rawDb,
    log: (message: string) => logged.push(message),
  } as never);
  return logged;
}

describe('file captions become markup', () => {
  it('keeps the words of every recording’s and file’s caption', () => {
    seed();
    expect(migrate()).toEqual([
      'Rewrote the file captions of 2 texts and drafts.',
    ]);
    for (const data of [
      stored('content', 'c-1'),
      stored('content-history', 'h-1'),
    ]) {
      expect(data.blocks[0].data.caption).toBe(
        'Q1 &lt; Q2 &amp; &lt;b&gt;not bold&lt;/b&gt;',
      );
      expect(data.blocks[1].data.caption).toBe('Tom &amp; Jerry');
      // A picture's caption was markup already, and a paragraph is no file.
      expect(data.blocks[2].data.caption).toBe(
        '<b>Already</b> markup &amp; kept',
      );
      expect(data.blocks[3].data.text).toBe('a &lt; b');
      expect(contentPlainText(data)).toContain(
        'Prices Q1 < Q2 & <b>not bold</b> Tom & Jerry Already markup & kept',
      );
    }
    // A caption with nothing to escape leaves its text as it was.
    expect(stored('content', 'c-2').blocks[0].data.caption).toBe('Plain words');
  });
});
