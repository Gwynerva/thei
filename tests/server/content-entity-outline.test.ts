import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entityOutline } from '../../server/thei/content-links/anchors';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * Where inside an entity a link may lead: the anchors of its page's
 * headings, counted as the page counts them, and a project's sections — the
 * general ones in the owner's order, then the stages newest first, numbered
 * from the oldest.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

const header = (text: string) => ({ type: 'header', data: { text, level: 2 } });

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

function section(
  id: string,
  title: string,
  sortOrder: number,
  period?: string,
) {
  context.rawDb
    .prepare(
      'INSERT INTO "project-content-sections" (sectionUuid, projectUuid, title, summary, humanReadableSlug, publicId, isPrivate, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, \'\', ?, ?, 0, ?, 1, 1)',
    )
    .run(id, 'p-1', title, id, `pub${id}`, sortOrder);
  if (period)
    context.rawDb
      .prepare(
        "INSERT INTO periods (ownerType, ownerId, sortOrder, startDate, endDate) VALUES ('project-section', ?, 0, ?, ?)",
      )
      .run(id, period, period);
}

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    ...serverRepositories,
  });
  context.rawDb
    .prepare(
      "INSERT INTO projects (projectUuid, title, summary, access, humanReadableSlug, publicId, createdAt, updatedAt) VALUES ('p-1', 'Baldur''s Gate 3', 'A game.', 'public', 'bg3', 'P1', 1, 1)",
    )
    .run();
  text('project', 'p-1', 'project-description', [
    header('Why this game'),
    header('Results'),
  ]);
  text('project', 'p-1', 'project-notes', [header('Private notes')]);
  section('s-party', 'The party', 0);
  section('s-act1', 'Act 1', 1, '2023-08-10');
  section('s-act3', 'Act 3', 2, '2024-02-01');
  section('s-act2', 'Act 2', 3, '2023-11-05');
  text('project-section', 's-act2', 'project-section-body', [
    header('Shadows'),
    { type: 'privateSectionBoundary', data: { sectionId: 'x', edge: 'start' } },
    header('Shadows'),
    { type: 'privateSectionBoundary', data: { sectionId: 'x', edge: 'end' } },
  ]);
});

afterEach(async () => {
  await context.close();
});

describe('the outline of an entity', () => {
  it('lists a project’s headings, then its sections and stages', async () => {
    const outline = await entityOutline('project', 'p-1');
    expect(outline).toMatchObject({
      entityType: 'project',
      title: "Baldur's Gate 3",
      headings: [
        { id: 'why-this-game', title: 'Why this game', private: false },
        { id: 'results', title: 'Results', private: false },
      ],
      sections: [
        { entityId: 's-party', title: 'The party' },
        { entityId: 's-act3', title: 'Act 3', stage: { number: 3, count: 3 } },
        { entityId: 's-act2', title: 'Act 2', stage: { number: 2, count: 3 } },
        { entityId: 's-act1', title: 'Act 1', stage: { number: 1, count: 3 } },
      ],
    });
    // The private notes are not the page's text: none of their headings.
    expect(JSON.stringify(outline)).not.toContain('Private notes');
  });

  it('names a section’s project and marks its private headings', async () => {
    expect(await entityOutline('project-section', 's-act2')).toMatchObject({
      title: 'Act 2',
      parent: { entityId: 'p-1', title: "Baldur's Gate 3" },
      headings: [
        { id: 'shadows', private: false },
        { id: 'shadows-2', private: true },
      ],
    });
  });

  it('gives nothing for an entity that is gone', async () => {
    expect(await entityOutline('event', 'missing')).toBeUndefined();
  });
});
