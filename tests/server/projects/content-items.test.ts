import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../../server/thei/db/schema';
import { createContentHistoryTable } from '../fixtures/content-history-table';
import {
  applyProjectSections,
  deleteProjectSections,
  getProjectSections,
  prepareProjectSections,
} from '../../../server/thei/projects/content-sections';
import {
  prepareProjectContentItems,
  ProjectContentItemStorageError,
  projectContentItemIdentities,
  projectContentItemIdsToRemove,
} from '../../../server/thei/projects/content-items';
import { periodsEqual } from '../../../server/thei/periods';
import type { Period } from '../../../shared/period';
import type { ProjectSectionItem } from '../../../shared/project-content-item';

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
      label: 'section',
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
    ).rejects.toThrow('Unknown section');
    expect(projectContentItemIdsToRemove(['a', 'b'], ['b', 'c'])).toEqual([
      'a',
    ]);
  });
});

describe('project section storage', () => {
  it('rejects unsupported period owner types', () => {
    const db = createDb();
    expect(() =>
      db
        .insert(schema.periods)
        .values({
          ownerType: 'project-stage' as 'project-section',
          ownerId: 'section',
          sortOrder: 0,
          startDate: '2026-01-01',
          endDate: '2026-01-02',
        })
        .run(),
    ).toThrow();
  });

  it('keeps the owner order of undated sections before the dated ones in time, and cleans removed ones', async () => {
    const db = createDb();
    installServerContext(db);
    const sections: NonNullable<Parameters<typeof applyProjectSections>[3]> = [
      section('section-late', 'Late', {
        periods: [period('2026-06-01', '2026-06-30')],
      }),
      section('section-second', 'Second'),
      section('section-early', 'Early', {
        periods: [period('2025-01-01', '2025-01-31')],
      }),
      section('section-first', 'First', { isPrivate: true }),
    ];

    applyProjectSections(db, schema, 'project', sections);
    db.insert(schema.periods)
      .values({
        ownerType: 'event',
        ownerId: 'section-late',
        sortOrder: 0,
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      })
      .run();
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'asset-orphan',
        containerType: 'content',
        containerId: 'content-section-late',
        role: 'content',
      })
      .run();

    await expect(getProjectSections('project')).resolves.toMatchObject([
      { sectionUuid: 'section-second', periods: [] },
      { sectionUuid: 'section-first', periods: [] },
      { sectionUuid: 'section-early' },
      { sectionUuid: 'section-late' },
    ]);
    expect(
      db
        .select()
        .from(schema.projectContentSections)
        .all()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((row) => row.sectionUuid),
    ).toEqual([
      'section-second',
      'section-first',
      'section-early',
      'section-late',
    ]);

    // The late section goes, and its body, files and periods with it; an
    // event's period that happens to share its id stays.
    applyProjectSections(db, schema, 'project', [
      sections[1]!,
      sections[2]!,
      sections[3]!,
    ]);
    expect(
      db
        .select()
        .from(schema.content)
        .all()
        .map((row) => row.contentUuid),
    ).not.toContain('content-section-late');
    expect(db.select().from(schema.assetUsages).all()).toEqual([]);
    expect(
      db
        .select()
        .from(schema.periods)
        .all()
        .map((row) => `${row.ownerType}:${row.ownerId}`)
        .sort(),
    ).toEqual(['event:section-late', 'project-section:section-early']);

    deleteProjectSections(db, schema, 'project');
    expect(db.select().from(schema.projectContentSections).all()).toEqual([]);
    expect(db.select().from(schema.content).all()).toEqual([]);
    expect(db.select().from(schema.periods).all()).toEqual([
      {
        ownerType: 'event',
        ownerId: 'section-late',
        sortOrder: 0,
        startDate: '2027-01-01',
        endDate: '2027-01-02',
        precision: 'exact',
        precisionNote: '',
        label: '',
      },
    ]);
  });

  it("keeps a section's banner as one placement of its own, and an edit when it changes", async () => {
    const db = createDb();
    installServerContext(db);
    const banners = () =>
      db
        .select()
        .from(schema.assetUsages)
        .all()
        .filter((row) => row.role === 'banner')
        .map(
          (row) => `${row.containerType}:${row.containerId}:${row.assetUuid}`,
        )
        .sort();
    const updatedAt = (sectionUuid: string) =>
      db
        .select()
        .from(schema.projectContentSections)
        .all()
        .find((row) => row.sectionUuid === sectionUuid)!.updatedAt;
    const unchanged = (item: ReturnType<typeof section>) => ({
      ...item,
      contentSave: { ...item.contentSave, changed: false },
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const first = section('section-a', 'A', { bannerAssetUuid: 'banner-1' });
    const second = section('section-b', 'B');
    applyProjectSections(db, schema, 'project', [first, second]);
    expect(banners()).toEqual(['project-section:section-a:banner-1']);
    await expect(getProjectSections('project')).resolves.toMatchObject([
      { sectionUuid: 'section-a', bannerAssetUuid: 'banner-1' },
      { sectionUuid: 'section-b' },
    ]);

    // Saved again as it was: no new placement, and no edit.
    now.mockReturnValue(2000);
    applyProjectSections(db, schema, 'project', [
      unchanged(first),
      unchanged(second),
    ]);
    expect(banners()).toEqual(['project-section:section-a:banner-1']);
    expect(updatedAt('section-a')).toBe(1000);

    // A new banner replaces the old placement, and is an edit of the section.
    now.mockReturnValue(3000);
    applyProjectSections(db, schema, 'project', [
      unchanged({ ...first, bannerAssetUuid: 'banner-2' }),
      unchanged({ ...second, bannerAssetUuid: 'banner-2' }),
    ]);
    expect(banners()).toEqual([
      'project-section:section-a:banner-2',
      'project-section:section-b:banner-2',
    ]);
    expect(updatedAt('section-a')).toBe(3000);

    // Taken off, and gone with its section.
    applyProjectSections(db, schema, 'project', [
      unchanged({ ...first, bannerAssetUuid: undefined }),
    ]);
    expect(banners()).toEqual([]);
    applyProjectSections(db, schema, 'project', [
      unchanged({ ...first, bannerAssetUuid: 'banner-3' }),
    ]);
    deleteProjectSections(db, schema, 'project');
    expect(banners()).toEqual([]);
  });

  it('keeps a section that is only its dates without any body', async () => {
    const db = createDb();
    installServerContext(db);
    applyProjectSections(db, schema, 'project', [
      {
        ...section('section-dates', 'Dates', {
          periods: [period('2026-03-01', '2026-03-10')],
        }),
        contentSave: { type: 'delete' },
      },
    ]);

    expect(db.select().from(schema.content).all()).toEqual([]);
    await expect(getProjectSections('project')).resolves.toMatchObject([
      {
        sectionUuid: 'section-dates',
        periods: [{ startDate: '2026-03-01', endDate: '2026-03-10' }],
        content: { data: { blocks: [] } },
      },
    ]);
  });

  it('keeps period labels in their stored order', async () => {
    const db = createDb();
    installServerContext(db);
    const dates = { startDate: '2026-07-01', endDate: '2026-07-10' };
    const periods = [
      { ...dates, precision: 'exact' as const, precisionNote: '', label: 'b' },
      { ...dates, precision: 'exact' as const, precisionNote: '', label: 'a' },
    ];
    applyProjectSections(db, schema, 'project', [
      section('section', 'Trip', { periods }),
    ]);

    const [stored] = await getProjectSections('project');
    expect(stored!.periods.map((item) => item.label)).toEqual(['b', 'a']);
    expect(periodsEqual(stored!.periods, periods)).toBe(true);
    expect(
      periodsEqual(stored!.periods, [
        periods[0]!,
        { ...periods[1]!, label: 'c' },
      ]),
    ).toBe(false);
  });

  it('returns explicit empty content for a section without a body row', async () => {
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

    await expect(getProjectSections('project')).resolves.toMatchObject([
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
    CREATE TABLE "periods" (
      "ownerType" text NOT NULL,
      "ownerId" text NOT NULL,
      "sortOrder" integer NOT NULL,
      "startDate" text NOT NULL,
      "endDate" text NOT NULL,
      "precision" text DEFAULT 'exact' NOT NULL,
      "precisionNote" text DEFAULT '' NOT NULL,
      "label" text DEFAULT '' NOT NULL,
      PRIMARY KEY("ownerType", "ownerId", "sortOrder"),
      CONSTRAINT "periods-owner-type-check"
        CHECK("ownerType" in ('event', 'project-section'))
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
  createContentHistoryTable(rawDb);
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

/** A section as the storage layer receives it, its body already prepared. */
function section(
  sectionUuid: string,
  title: string,
  overrides: {
    periods?: Period[];
    isPrivate?: boolean;
    bannerAssetUuid?: string;
  } = {},
) {
  return {
    ...(overrides.bannerAssetUuid
      ? { bannerAssetUuid: overrides.bannerAssetUuid }
      : {}),
    sectionUuid,
    title,
    summary: '',
    humanReadableSlug: title.toLowerCase(),
    publicId: sectionUuid.replace(/[^A-Za-z0-9]/g, ''),
    isPrivate: overrides.isPrivate ?? false,
    periods: overrides.periods ?? [],
    content: { data: { blocks: [] } },
    contentSave: preparedContent(`content-${sectionUuid}`, `${title} text`),
  };
}

describe('project section identity round trip', () => {
  it.each([
    ['an undated', () => newSection()],
    ['a dated', () => newSection([period('2026-01-01', '2026-01-31')])],
  ])('keeps %s saved section addressable on the next save', async (_, make) => {
    const db = createDb();
    installServerContext(db);

    // First save: the form has no uuid yet, only the public ID it made up.
    const created = await prepareProjectSections('project', [make()]);
    applyProjectSections(db, schema, 'project', created);
    const identities = projectContentItemIdentities(
      created,
      (item) => item.sectionUuid,
      (item) => item.publicId,
    );
    expect(identities).toEqual([
      { publicId: 'SectionOne', itemUuid: created![0]!.sectionUuid },
    ]);

    // Second save with the identity applied back: the row is its own, not a
    // stranger's claim on the public ID.
    await expect(
      prepareProjectSections('project', [
        { ...make(), sectionUuid: identities[0]!.itemUuid },
      ]),
    ).resolves.toMatchObject([{ sectionUuid: identities[0]!.itemUuid }]);

    // Without it — the bug this pairing exists to prevent.
    await expect(prepareProjectSections('project', [make()])).rejects.toThrow(
      'Section public ID is already taken',
    );
  });

  it('lets two sections swap their public IDs in one save', async () => {
    const db = createDb();
    installServerContext(db);
    applyProjectSections(db, schema, 'project', [
      section('a', 'A'),
      section('b', 'B'),
    ] as any);

    const swapped = await prepareProjectSections('project', [
      { ...section('a', 'A'), publicId: 'b' },
      { ...section('b', 'B'), publicId: 'a' },
    ]);
    applyProjectSections(db, schema, 'project', swapped);

    expect(
      db
        .select({
          sectionUuid: schema.projectContentSections.sectionUuid,
          publicId: schema.projectContentSections.publicId,
        })
        .from(schema.projectContentSections)
        .all(),
    ).toEqual([
      { sectionUuid: 'a', publicId: 'b' },
      { sectionUuid: 'b', publicId: 'a' },
    ]);
  });
});

describe('project section edit times', () => {
  it('moves the edit time of a section only when it changed', async () => {
    const db = createDb();
    installServerContext(db);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const created = await prepareProjectSections('project', [
      newSection([period('2026-01-01', '2026-01-31')]),
    ]);
    applyProjectSections(db, schema, 'project', created);
    const sectionUuid = created![0]!.sectionUuid;
    const updatedAt = () =>
      db.select().from(schema.projectContentSections).get()!.updatedAt;
    const save = async (changes: Partial<ReturnType<typeof newSection>>) =>
      applyProjectSections(
        db,
        schema,
        'project',
        await prepareProjectSections('project', [
          {
            ...newSection([period('2026-01-01', '2026-01-31')]),
            ...changes,
            sectionUuid,
          },
        ]),
      );

    // The project saved again, this section untouched.
    now.mockReturnValue(2000);
    await save({});
    expect(updatedAt()).toBe(1000);

    now.mockReturnValue(3000);
    await save({ periods: [period('2026-02-01', '2026-02-28')] });
    expect(updatedAt()).toBe(3000);

    now.mockReturnValue(4000);
    await save({
      periods: [period('2026-02-01', '2026-02-28')],
      title: 'Renamed',
    });
    expect(updatedAt()).toBe(4000);

    // A label is part of what the section says about when it was.
    now.mockReturnValue(5000);
    await save({
      periods: [period('2026-02-01', '2026-02-28', 'Winter')],
      title: 'Renamed',
    });
    expect(updatedAt()).toBe(5000);

    // Losing its dates is an edit too.
    now.mockReturnValue(6000);
    await save({
      periods: [],
      title: 'Renamed',
      content: {
        data: {
          blocks: [{ type: 'paragraph', data: { text: 'Now a topic' } }],
        },
      },
    });
    expect(updatedAt()).toBe(6000);
  });

  it('does not count a new position as an edit of a section', async () => {
    const db = createDb();
    installServerContext(db);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const second = { ...newSection(), publicId: 'SectionTwo', title: 'Two' };
    const created = await prepareProjectSections('project', [
      newSection(),
      second,
    ]);
    applyProjectSections(db, schema, 'project', created);
    const [first, other] = created!;
    const updatedAt = (uuid: string) =>
      db
        .select()
        .from(schema.projectContentSections)
        .all()
        .find((row) => row.sectionUuid === uuid)!.updatedAt;

    now.mockReturnValue(2000);
    applyProjectSections(
      db,
      schema,
      'project',
      await prepareProjectSections('project', [
        { ...second, sectionUuid: other!.sectionUuid },
        { ...newSection(), title: 'Renamed', sectionUuid: first!.sectionUuid },
      ]),
    );
    expect(updatedAt(other!.sectionUuid)).toBe(1000);
    expect(updatedAt(first!.sectionUuid)).toBe(2000);
  });
});

/** A period as the form sends it, already normalized. */
function period(startDate: string, endDate: string, label = ''): Period {
  return {
    startDate,
    endDate,
    precision: 'exact' as const,
    precisionNote: '',
    label,
  };
}

function newSection(periods: Period[] = []): ProjectSectionItem {
  return {
    title: 'One',
    summary: '',
    humanReadableSlug: 'one',
    publicId: 'SectionOne',
    isPrivate: false,
    periods,
    content: {
      data: { blocks: [{ type: 'paragraph', data: { text: 'Body' } }] },
    },
  };
}
