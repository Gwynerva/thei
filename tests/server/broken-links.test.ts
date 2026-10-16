import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  blocksThatHad,
  recordContentAnchors,
} from '../../server/thei/content-links/anchor-ledger';
import {
  applyPreparedContentSave,
  deleteContentForOwner,
} from '../../server/thei/content/repository';
import {
  brokenLinkAt,
  scanBrokenLinks,
} from '../../server/thei/content-links/broken';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * The links of the archive's texts that lead nowhere now — to an entity
 * gone, to a heading its page no longer has — and where each may lead
 * instead: the heading it became, one named like it, the whole entity; for
 * an entity gone, what the link's words name, and at last no link.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

const header = (id: string, text: string) => ({
  id,
  type: 'header',
  data: { text, level: 2 },
});
const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph',
  data: { text },
});
const link = (type: string, id: string, words: string, fragment?: string) =>
  `<a data-content-link="entity" data-entity-type="${type}" data-entity-id="${id}"${fragment ? ` data-entity-fragment="${fragment}"` : ''}>${words}</a>`;

function text(
  ownerType: string,
  ownerId: string,
  slot: string,
  blocks: unknown[],
) {
  context.rawDb
    .prepare(
      'INSERT INTO content (contentUuid, ownerType, ownerId, slot, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, 1)',
    )
    .run(
      `c-${ownerId}-${slot}`,
      ownerType,
      ownerId,
      slot,
      JSON.stringify({ blocks }),
    );
}

const description = (second: string) => [
  header('b1', 'Goals'),
  header('b2', second),
];

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    ...serverRepositories,
  });
  context.rawDb
    .prepare(
      "INSERT INTO projects (projectUuid, title, summary, access, humanReadableSlug, publicId, createdAt, updatedAt) VALUES ('p-1', 'Harbour', 'A harbour.', 'public', 'harbour', 'P1', 1, 1)",
    )
    .run();
  context.rawDb
    .prepare(
      "INSERT INTO events (eventUuid, title, summary, access, humanReadableSlug, publicId, synonyms, createdAt, updatedAt) VALUES ('e-1', 'Night of lanterns', 'A night.', 'public', 'night', 'E1', '[\"lanterns\"]', 1, 2)",
    )
    .run();
  context.rawDb
    .prepare(
      "INSERT INTO pages (pageUuid, title, slug, summary, access, createdAt, updatedAt) VALUES ('pg-1', 'Notes', 'notes', 'Notes.', 'public', 1, 1)",
    )
    .run();
  // The heading was «Results» once, and is «Outcomes» now.
  recordContentAnchors(
    context.db,
    context.schema,
    { ownerType: 'project', ownerId: 'p-1', slot: 'project-description' },
    [{ blocks: description('Results') }, { blocks: description('Outcomes') }],
    1,
  );
  text('project', 'p-1', 'project-description', description('Outcomes'));
  text('page', 'pg-1', 'page-body', [
    paragraph(
      'q1',
      [
        link('project', 'p-1', 'the goals', 'goals'),
        link('project', 'p-1', 'the results', 'results'),
        link('project', 'p-1', 'the sections', 'project-sections'),
        link('project', 'p-1', 'a passage', ':~:text=harbour'),
        link('project', 'p-gone', 'the lanterns'),
      ].join(' and '),
    ),
    {
      id: 'k1',
      type: 'entityLink',
      data: { entityType: 'project', entityId: 'p-1', fragment: 'goal' },
    },
  ]);
});

afterEach(async () => {
  await context.close();
});

describe('broken links', () => {
  it('are found, a place of the page and a passage never among them', async () => {
    const { links, next } = await scanBrokenLinks();
    expect(
      links.map((item) => [item.link.id, item.problem, item.link.words]),
    ).toEqual([
      ['q1/0/1', 'heading-gone', 'the results'],
      ['q1/0/4', 'entity-gone', 'the lanterns'],
      ['k1/card', 'heading-gone', ''],
    ]);
    expect(links[0]!.in).toEqual({
      ref: 'page:pg-1',
      title: 'Notes',
      text: 'body',
    });
    // All read: there is nothing to go on to.
    expect(next).toBeUndefined();
  });

  it('offer the heading a renamed one became first, the whole entity last', async () => {
    const { links } = await scanBrokenLinks();
    expect(links[0]!.candidates).toEqual([
      {
        to: 'thei:project/p-1#outcomes',
        title: 'Harbour › Outcomes',
        why: 'renamed',
      },
      { to: 'thei:project/p-1', title: 'Harbour', why: 'whole' },
    ]);
    // «goal» is near «goals».
    expect(links[2]!.candidates[0]).toMatchObject({
      to: 'thei:project/p-1#goals',
      why: 'similar',
    });
  });

  it('offer what the words name for an entity gone, and at last no link', async () => {
    const { links } = await scanBrokenLinks();
    expect(links[1]!.candidates).toEqual([
      { to: 'thei:event/e-1', title: 'Night of lanterns', why: 'named' },
      { to: null, title: 'the lanterns', why: 'unlink' },
    ]);
  });

  it('come a page at a time', async () => {
    // A text is read whole, so a page may hold more than it was asked for.
    const first = await scanBrokenLinks({ limit: 1 });
    expect(first.links).toHaveLength(3);
    expect(first.next).toBeDefined();
    expect((await scanBrokenLinks({ cursor: first.next })).links).toEqual([]);
    const none = await scanBrokenLinks({ budget: 0 });
    expect(none.links).toEqual([]);
  });

  it('are told of one by its place', async () => {
    const data = {
      blocks: [paragraph('q1', link('project', 'p-1', 'x', 'results'))],
    };
    expect((await brokenLinkAt(data, 'q1/0/0'))?.problem).toBe('heading-gone');
    expect(await brokenLinkAt(data, 'q1/0/3')).toBeUndefined();
  });

  it('are mended by what a save remembers, forgotten with the owner', () => {
    const save = (second: string) =>
      context.db.transaction((tx: any) =>
        applyPreparedContentSave(
          tx,
          context.schema,
          'page',
          'pg-1',
          'page-body',
          {
            type: 'save',
            contentUuid: 'c-pg-1-page-body',
            changed: true,
            data: { blocks: description(second) },
            blockCount: 2,
            wordCount: 0,
            assetCount: 0,
            assetTotalSize: 0,
            assetUsages: [],
          } as never,
        ),
      );
    save('Before');
    save('After');
    const field = {
      ownerType: 'page',
      ownerId: 'pg-1',
      slot: 'page-body',
    } as const;
    expect(blocksThatHad(field, 'before').map((row) => row.blockId)).toEqual([
      'b2',
    ]);
    expect(blocksThatHad(field, 'after')).toHaveLength(1);
    // Gone with the owner's texts.
    context.db.transaction((tx: any) =>
      deleteContentForOwner(tx, context.schema, 'page', 'pg-1'),
    );
    expect(blocksThatHad(field, 'before')).toEqual([]);
  });
});
