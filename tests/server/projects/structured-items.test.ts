import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../../server/thei/db/schema';
import {
  applyProjectContentSections,
  deleteProjectContentSections,
  getProjectContentSections,
} from '../../../server/thei/projects/content-sections';
import {
  applyProjectStages,
  deleteProjectStages,
  getProjectStages,
} from '../../../server/thei/projects/stages';
import {
  prepareProjectStructuredItems,
  ProjectStructuredItemStorageError,
  projectStructuredItemIdsToRemove,
} from '../../../server/thei/projects/structured-items';

let rawDb: Database.Database | undefined;

afterEach(() => {
  rawDb?.close();
  rawDb = undefined;
  delete (globalThis as any).THEI_SERVER;
});

describe('project structured item preparation', () => {
  it('creates missing IDs and rejects duplicate or unknown submitted IDs', async () => {
    const baseOptions = {
      existingIds: new Set(['known']),
      getId: (item: { id?: string }) => item.id,
      createId: async () => 'created',
      label: 'stage',
      prepare: async (item: { id?: string }, id: string) => ({ ...item, id }),
    };

    await expect(
      prepareProjectStructuredItems([{}], baseOptions),
    ).resolves.toEqual([{ id: 'created' }]);
    await expect(
      prepareProjectStructuredItems(
        [{ id: 'known' }, { id: 'known' }],
        baseOptions,
      ),
    ).rejects.toThrow(ProjectStructuredItemStorageError);
    await expect(
      prepareProjectStructuredItems([{ id: 'foreign' }], baseOptions),
    ).rejects.toThrow('Unknown stage');
    expect(projectStructuredItemIdsToRemove(['a', 'b'], ['b', 'c'])).toEqual([
      'a',
    ]);
  });
});

describe('project structured item storage', () => {
  it('sorts stages, preserves section order, and cleans removed content', async () => {
    const db = createDb();
    installServerContext(db);
    const stages: NonNullable<Parameters<typeof applyProjectStages>[3]> = [
      {
        stageUuid: 'stage-late',
        title: 'Late',
        summary: '',
        isPrivate: false,
        period: { startDate: '2026-06-01', endDate: '2026-06-30' },
        contentSave: preparedContent('content-late', 'Late content'),
      },
      {
        stageUuid: 'stage-early',
        title: 'Early',
        summary: '',
        isPrivate: false,
        period: { startDate: '2025-01-01', endDate: '2025-01-31' },
        contentSave: preparedContent('content-early', 'Early content'),
      },
    ];
    const sections: NonNullable<
      Parameters<typeof applyProjectContentSections>[3]
    > = [
      {
        sectionUuid: 'section-second',
        title: 'Second',
        summary: '',
        isPrivate: false,
        content: { data: { blocks: [] } },
        contentSave: preparedContent('content-second', 'Second content'),
      },
      {
        sectionUuid: 'section-first',
        title: 'First',
        summary: '',
        isPrivate: true,
        content: { data: { blocks: [] } },
        contentSave: preparedContent('content-first', 'First content'),
      },
    ];

    applyProjectStages(db, schema, 'project', stages);
    applyProjectContentSections(db, schema, 'project', sections);
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'asset-orphan',
        containerType: 'content',
        containerId: 'content-late',
        role: 'content',
      })
      .run();

    await expect(getProjectStages('project')).resolves.toMatchObject([
      { stageUuid: 'stage-early' },
      { stageUuid: 'stage-late' },
    ]);
    await expect(getProjectContentSections('project')).resolves.toMatchObject([
      { sectionUuid: 'section-second' },
      { sectionUuid: 'section-first' },
    ]);

    applyProjectStages(db, schema, 'project', [
      {
        ...stages[1]!,
        contentSave: {
          type: 'delete',
          existingContentUuid: 'content-early',
        },
      },
    ]);
    deleteProjectContentSections(db, schema, 'project');

    expect(db.select().from(schema.projectStages).all()).toHaveLength(1);
    expect(db.select().from(schema.projectContentSections).all()).toEqual([]);
    expect(db.select().from(schema.content).all()).toEqual([]);
    expect(db.select().from(schema.assetUsages).all()).toEqual([]);

    deleteProjectStages(db, schema, 'project');
    expect(db.select().from(schema.projectStages).all()).toEqual([]);
  });

  it('returns explicit empty content for a damaged section row', async () => {
    const db = createDb();
    installServerContext(db);
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: 'section-empty',
        projectUuid: 'project',
        title: 'Repair me',
        summary: '',
        isPrivate: false,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    await expect(getProjectContentSections('project')).resolves.toMatchObject([
      {
        sectionUuid: 'section-empty',
        content: {
          data: { blocks: [] },
          blockCount: 0,
          assetCount: 0,
          assetTotalSize: 0,
        },
      },
    ]);
  });
});

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE "project-stages" (
      "stageUuid" text PRIMARY KEY NOT NULL,
      "projectUuid" text NOT NULL,
      "title" text NOT NULL,
      "summary" text DEFAULT '' NOT NULL,
      "isPrivate" integer DEFAULT false NOT NULL,
      "startDate" text NOT NULL,
      "endDate" text NOT NULL,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE "project-content-sections" (
      "sectionUuid" text PRIMARY KEY NOT NULL,
      "projectUuid" text NOT NULL,
      "title" text NOT NULL,
      "summary" text DEFAULT '' NOT NULL,
      "isPrivate" integer DEFAULT false NOT NULL,
      "sortOrder" integer NOT NULL,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE "content" (
      "contentUuid" text PRIMARY KEY NOT NULL,
      "ownerType" text NOT NULL,
      "ownerId" text NOT NULL,
      "slot" text NOT NULL,
      "data" text NOT NULL,
      "blockCount" integer DEFAULT 0 NOT NULL,
      "assetCount" integer DEFAULT 0 NOT NULL,
      "assetTotalSize" integer DEFAULT 0 NOT NULL,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE UNIQUE INDEX "content-owner-slot-idx"
      ON "content" ("ownerType", "ownerId", "slot");
    CREATE TABLE "asset-usages" (
      "assetUuid" text NOT NULL,
      "containerType" text NOT NULL,
      "containerId" text NOT NULL,
      "role" text NOT NULL,
      "meta" text,
      PRIMARY KEY("assetUuid", "containerType", "containerId", "role")
    );
  `);
  return drizzle(rawDb, { schema });
}

function installServerContext(db: ReturnType<typeof createDb>) {
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    content: {
      buildFieldValue: async (
        ownerType: string,
        ownerId: string,
        slot: string,
      ) => {
        const row = db
          .select()
          .from(schema.content)
          .all()
          .find(
            (item) =>
              item.ownerType === ownerType &&
              item.ownerId === ownerId &&
              item.slot === slot,
          );
        return row
          ? {
              contentUuid: row.contentUuid,
              data: row.data,
              blockCount: row.blockCount,
              assetCount: row.assetCount,
              assetTotalSize: row.assetTotalSize,
            }
          : undefined;
      },
    },
  };
}

function preparedContent(contentUuid: string, text: string) {
  return {
    type: 'save' as const,
    contentUuid,
    data: { blocks: [{ type: 'paragraph' as const, data: { text } }] },
    blockCount: 1,
    assetCount: 0,
    assetTotalSize: 0,
    assetUsages: [],
  };
}
