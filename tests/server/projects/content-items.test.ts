import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../../server/thei/db/schema';
import {
  applyProjectContentSections,
  deleteProjectContentSections,
  getProjectContentSections,
  prepareProjectContentSections,
} from '../../../server/thei/projects/content-sections';
import {
  applyProjectStages,
  deleteProjectStages,
  getProjectStages,
  prepareProjectStages,
} from '../../../server/thei/projects/stages';
import {
  prepareProjectContentItems,
  ProjectContentItemStorageError,
  projectContentItemIdentities,
  projectContentItemIdsToRemove,
} from '../../../server/thei/projects/content-items';

let rawDb: Database.Database | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  rawDb?.close();
  rawDb = undefined;
  delete (globalThis as any).THEI_SERVER;
});

describe('project content item preparation', () => {
  it('creates missing IDs and rejects duplicate or unknown submitted IDs', async () => {
    const baseOptions = {
      existingIds: new Set(['known']),
      getId: (item: { id?: string }) => item.id,
      createId: async () => 'created',
      label: 'stage',
      prepare: async (item: { id?: string }, id: string) => ({ ...item, id }),
    };

    await expect(
      prepareProjectContentItems([{}], baseOptions),
    ).resolves.toEqual([{ id: 'created' }]);
    await expect(
      prepareProjectContentItems(
        [{ id: 'known' }, { id: 'known' }],
        baseOptions,
      ),
    ).rejects.toThrow(ProjectContentItemStorageError);
    await expect(
      prepareProjectContentItems([{ id: 'foreign' }], baseOptions),
    ).rejects.toThrow('Unknown stage');
    expect(projectContentItemIdsToRemove(['a', 'b'], ['b', 'c'])).toEqual([
      'a',
    ]);
  });
});

describe('project content item storage', () => {
  it('rejects unsupported stage owner types', () => {
    const db = createDb();
    expect(() =>
      db
        .insert(schema.stagePeriods)
        .values({
          stageType: 'unsupported-stage' as 'project-stage',
          stageUuid: 'stage',
          sortOrder: 0,
          startDate: '2026-01-01',
          endDate: '2026-01-02',
        })
        .run(),
    ).toThrow();
  });

  it('sorts stages, preserves section order, and cleans removed content', async () => {
    const db = createDb();
    installServerContext(db);
    const stages: NonNullable<Parameters<typeof applyProjectStages>[3]> = [
      {
        stageUuid: 'stage-late',
        isStage: true,
        title: 'Late',
        summary: '',
        humanReadableSlug: 'late',
        publicId: 'StageLate',
        isPrivate: false,
        periods: [{ startDate: '2026-06-01', endDate: '2026-06-30' }],
        contentSave: preparedContent('content-late', 'Late content'),
      },
      {
        stageUuid: 'stage-early',
        isStage: true,
        title: 'Early',
        summary: '',
        humanReadableSlug: 'early',
        publicId: 'StageEarly',
        isPrivate: false,
        periods: [{ startDate: '2025-01-01', endDate: '2025-01-31' }],
        contentSave: preparedContent('content-early', 'Early content'),
      },
    ];
    const sections: NonNullable<
      Parameters<typeof applyProjectContentSections>[3]
    > = [
      {
        sectionUuid: 'section-second',
        isStage: false,
        title: 'Second',
        summary: '',
        humanReadableSlug: 'second',
        publicId: 'SectionSecond',
        isPrivate: false,
        content: { data: { blocks: [] } },
        contentSave: preparedContent('content-second', 'Second content'),
      },
      {
        sectionUuid: 'section-first',
        isStage: false,
        title: 'First',
        summary: '',
        humanReadableSlug: 'first',
        publicId: 'SectionFirst',
        isPrivate: true,
        content: { data: { blocks: [] } },
        contentSave: preparedContent('content-first', 'First content'),
      },
    ];

    applyProjectStages(db, schema, 'project', stages);
    db.insert(schema.stagePeriods)
      .values({
        stageType: 'event-stage',
        stageUuid: 'stage-late',
        sortOrder: 0,
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      })
      .run();
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
    expect(
      db
        .select()
        .from(schema.stagePeriods)
        .all()
        .filter((period) => period.stageType === 'event-stage'),
    ).toHaveLength(1);
    expect(db.select().from(schema.projectContentSections).all()).toEqual([]);
    expect(db.select().from(schema.content).all()).toEqual([]);
    expect(db.select().from(schema.assetUsages).all()).toEqual([]);

    deleteProjectStages(db, schema, 'project');
    expect(db.select().from(schema.projectStages).all()).toEqual([]);
    expect(db.select().from(schema.stagePeriods).all()).toEqual([
      {
        stageType: 'event-stage',
        stageUuid: 'stage-late',
        sortOrder: 0,
        startDate: '2027-01-01',
        endDate: '2027-01-02',
        precision: 'exact',
        precisionNote: '',
      },
    ]);
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
        humanReadableSlug: 'repair-me',
        publicId: 'RepairMe',
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
          wordCount: 0,
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
      "humanReadableSlug" text NOT NULL,
      "publicId" text NOT NULL UNIQUE,
      "isPrivate" integer DEFAULT false NOT NULL,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE "stage-periods" (
      "stageType" text NOT NULL,
      "stageUuid" text NOT NULL,
      "sortOrder" integer NOT NULL,
      "startDate" text NOT NULL,
      "endDate" text NOT NULL,
      "precision" text DEFAULT 'exact' NOT NULL,
      "precisionNote" text DEFAULT '' NOT NULL,
      PRIMARY KEY("stageType", "stageUuid", "sortOrder"),
      CONSTRAINT "stage-periods-stage-type-check"
        CHECK("stageType" in ('project-stage', 'event-stage'))
    );
    CREATE TABLE "project-content-sections" (
      "sectionUuid" text PRIMARY KEY NOT NULL,
      "projectUuid" text NOT NULL,
      "title" text NOT NULL,
      "summary" text DEFAULT '' NOT NULL,
      "humanReadableSlug" text NOT NULL,
      "publicId" text NOT NULL UNIQUE,
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
              wordCount: 0,
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
    changed: true,
    data: { blocks: [{ type: 'paragraph' as const, data: { text } }] },
    blockCount: 1,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    assetCount: 0,
    assetTotalSize: 0,
    assetUsages: [],
  };
}

describe('project content item identity round trip', () => {
  it('keeps a saved stage addressable on the next save', async () => {
    const db = createDb();
    installServerContext(db);

    // First save: the form has no uuid yet, only the public ID it made up.
    const created = await prepareProjectStages('project', [newStage()]);
    applyProjectStages(db, schema, 'project', created);
    const identities = projectContentItemIdentities(
      created,
      (stage) => stage.stageUuid,
      (stage) => stage.publicId,
    );
    expect(identities).toEqual([
      { publicId: 'StageOne', itemUuid: created![0]!.stageUuid },
    ]);

    // Second save with the identity applied back: the row is its own, not a
    // stranger's claim on the public ID.
    await expect(
      prepareProjectStages('project', [
        { ...newStage(), stageUuid: identities[0]!.itemUuid },
      ]),
    ).resolves.toMatchObject([{ stageUuid: identities[0]!.itemUuid }]);

    // Without it — the bug this pairing exists to prevent.
    await expect(prepareProjectStages('project', [newStage()])).rejects.toThrow(
      'Stage public ID is already taken',
    );
  });

  it('keeps a saved section addressable on the next save', async () => {
    const db = createDb();
    installServerContext(db);

    const created = await prepareProjectContentSections('project', [
      newSection(),
    ]);
    applyProjectContentSections(db, schema, 'project', created);
    const [identity] = projectContentItemIdentities(
      created,
      (section) => section.sectionUuid,
      (section) => section.publicId,
    );

    await expect(
      prepareProjectContentSections('project', [
        { ...newSection(), sectionUuid: identity!.itemUuid },
      ]),
    ).resolves.toMatchObject([{ sectionUuid: identity!.itemUuid }]);
    await expect(
      prepareProjectContentSections('project', [newSection()]),
    ).rejects.toThrow('Section public ID is already taken');
  });
});

describe('project content item edit times', () => {
  it('moves the edit time of a stage only when it changed', async () => {
    const db = createDb();
    installServerContext(db);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const created = await prepareProjectStages('project', [newStage()]);
    applyProjectStages(db, schema, 'project', created);
    const stageUuid = created![0]!.stageUuid;
    const updatedAt = () =>
      db.select().from(schema.projectStages).get()!.updatedAt;
    const save = async (stage: Partial<ReturnType<typeof newStage>>) =>
      applyProjectStages(
        db,
        schema,
        'project',
        await prepareProjectStages('project', [
          { ...newStage(), ...stage, stageUuid },
        ]),
      );

    // The project saved again, this stage untouched.
    now.mockReturnValue(2000);
    await save({});
    expect(updatedAt()).toBe(1000);

    now.mockReturnValue(3000);
    await save({
      periods: [{ startDate: '2026-02-01', endDate: '2026-02-28' }],
    });
    expect(updatedAt()).toBe(3000);

    now.mockReturnValue(4000);
    await save({
      periods: [{ startDate: '2026-02-01', endDate: '2026-02-28' }],
      title: 'Renamed',
    });
    expect(updatedAt()).toBe(4000);
  });

  it('does not count a new position as an edit of a section', async () => {
    const db = createDb();
    installServerContext(db);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const second = { ...newSection(), publicId: 'SectionTwo', title: 'Two' };
    const created = await prepareProjectContentSections('project', [
      newSection(),
      second,
    ]);
    applyProjectContentSections(db, schema, 'project', created);
    const [first, other] = created!;
    const updatedAt = (uuid: string) =>
      db
        .select()
        .from(schema.projectContentSections)
        .all()
        .find((row) => row.sectionUuid === uuid)!.updatedAt;

    now.mockReturnValue(2000);
    applyProjectContentSections(
      db,
      schema,
      'project',
      await prepareProjectContentSections('project', [
        { ...second, sectionUuid: other!.sectionUuid },
        { ...newSection(), title: 'Renamed', sectionUuid: first!.sectionUuid },
      ]),
    );
    expect(updatedAt(other!.sectionUuid)).toBe(1000);
    expect(updatedAt(first!.sectionUuid)).toBe(2000);
  });
});

function newStage() {
  return {
    isStage: true as const,
    title: 'One',
    summary: '',
    humanReadableSlug: 'one',
    publicId: 'StageOne',
    isPrivate: false,
    periods: [{ startDate: '2026-01-01', endDate: '2026-01-31' }],
  };
}

function newSection() {
  return {
    isStage: false as const,
    title: 'One',
    summary: '',
    humanReadableSlug: 'one',
    publicId: 'SectionOne',
    isPrivate: false,
    content: { data: { blocks: [] } },
  };
}
