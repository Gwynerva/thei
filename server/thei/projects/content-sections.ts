import { eq, inArray } from 'drizzle-orm';
import {
  orderProjectSections,
  type ProjectSectionItem,
} from '#layers/thei/shared/project-content-item';
import { createEmptyContentFieldValue } from '#layers/thei/shared/content';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  applyPreparedContentSave,
  prepareContentForSave,
  type PreparedContentSave,
} from '../content/repository';
import {
  deletePeriods,
  periodsEqual,
  readPeriods,
  readPeriodsOf,
  replacePeriods,
} from '../periods';
import {
  deleteProjectContentItemContent,
  prepareProjectContentItems,
  projectContentItemIdsToRemove,
  projectContentItemUpdatedAt,
  ProjectContentItemStorageError,
} from './content-items';
import type { projectContentSections } from '../db/schema/project-content-sections';
import {
  deleteEntityBanners,
  readEntityBannerUuids,
  syncEntityBanner,
} from '../entity-banner';

type ProjectContentSectionRow = typeof projectContentSections.$inferSelect;

type PreparedSection = ProjectSectionItem & {
  sectionUuid: string;
  contentSave: PreparedContentSave;
};

export async function prepareProjectSections(
  projectUuid: string,
  sections: ProjectSectionItem[] | undefined,
): Promise<PreparedSection[] | undefined> {
  if (sections === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const existing = db
    .select({ sectionUuid: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .all();
  const existingIds = new Set(existing.map((item) => item.sectionUuid));
  const publicIds = sections.map((section) => section.publicId);
  if (new Set(publicIds).size !== publicIds.length)
    throw new ProjectContentItemStorageError('Duplicate section public ID');
  if (publicIds.length) {
    const submittedIds = new Set(
      sections.map((section) => section.sectionUuid).filter(Boolean),
    );
    const collision = db
      .select({ sectionUuid: schema.projectContentSections.sectionUuid })
      .from(schema.projectContentSections)
      .where(inArray(schema.projectContentSections.publicId, publicIds))
      .all()
      .find((section) => !submittedIds.has(section.sectionUuid));
    if (collision)
      throw new ProjectContentItemStorageError(
        'Section public ID is already taken',
      );
  }
  return prepareProjectContentItems(sections, {
    existingIds,
    getId: (section) => section.sectionUuid,
    createId: () =>
      generateUniqueId(
        EntityPrefix.ProjectContentSection,
        async (id) =>
          !db
            .select({
              sectionUuid: schema.projectContentSections.sectionUuid,
            })
            .from(schema.projectContentSections)
            .where(eq(schema.projectContentSections.sectionUuid, id))
            .get(),
      ),
    label: 'section',
    prepare: async (section, sectionUuid) => {
      // An empty body is no body: a section that is only its dates keeps
      // no text at all.
      const contentSave = await prepareContentForSave(
        'project-section',
        sectionUuid,
        'project-section-body',
        section.content,
      );
      return { ...section, sectionUuid, contentSave };
    },
  });
}

export function applyProjectSections(
  tx: any,
  schema: any,
  projectUuid: string,
  sections: PreparedSection[] | undefined,
) {
  if (sections === undefined) return;
  const existing: ProjectContentSectionRow[] = tx
    .select()
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .all();
  const existingById = new Map(existing.map((row) => [row.sectionUuid, row]));
  const removed = projectContentItemIdsToRemove(
    existing.map((item) => item.sectionUuid),
    sections.map((section) => section.sectionUuid),
  );
  const banners = readEntityBannerUuids(
    tx,
    schema,
    'project-section',
    existing.map((item) => item.sectionUuid),
  );
  deleteProjectContentItemContent(tx, schema, 'project-section', removed);
  deletePeriods(tx, schema, 'project-section', removed);
  deleteEntityBanners(tx, schema, 'project-section', removed);
  if (removed.length) {
    tx.delete(schema.projectContentSections)
      .where(inArray(schema.projectContentSections.sectionUuid, removed))
      .run();
  }

  const now = Date.now();
  const ordered = orderProjectSections(sections);
  for (let index = 0; index < ordered.length; index++) {
    const section = ordered[index]!;
    const stored = existingById.get(section.sectionUuid);
    const bannerChanged = syncEntityBanner(
      tx,
      schema,
      'project-section',
      section.sectionUuid,
      banners.get(section.sectionUuid),
      section.bannerAssetUuid,
    );
    const updatedAt = projectContentItemUpdatedAt(
      stored,
      section,
      section.contentSave,
      now,
      Boolean(stored) &&
        (bannerChanged ||
          !periodsEqual(
            readPeriods(tx, schema, 'project-section', section.sectionUuid),
            section.periods,
          )),
    );
    tx.insert(schema.projectContentSections)
      .values({
        sectionUuid: section.sectionUuid,
        projectUuid,
        title: section.title,
        summary: section.summary,
        humanReadableSlug: section.humanReadableSlug,
        publicId: section.publicId,
        isPrivate: section.isPrivate,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.projectContentSections.sectionUuid,
        set: {
          title: section.title,
          summary: section.summary,
          humanReadableSlug: section.humanReadableSlug,
          publicId: section.publicId,
          isPrivate: section.isPrivate,
          sortOrder: index,
          updatedAt,
        },
      })
      .run();
    replacePeriods(
      tx,
      schema,
      'project-section',
      section.sectionUuid,
      section.periods,
    );
    applyPreparedContentSave(
      tx,
      schema,
      'project-section',
      section.sectionUuid,
      'project-section-body',
      section.contentSave,
    );
  }
}

export function deleteProjectSections(
  tx: any,
  schema: any,
  projectUuid: string,
) {
  const rows = tx
    .select({ sectionUuid: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .all();
  const ids = rows.map((row: { sectionUuid: string }) => row.sectionUuid);
  deleteProjectContentItemContent(tx, schema, 'project-section', ids);
  deletePeriods(tx, schema, 'project-section', ids);
  deleteEntityBanners(tx, schema, 'project-section', ids);
  if (!ids.length) return;
  tx.delete(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .run();
}

export async function getProjectSections(projectUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .orderBy(schema.projectContentSections.sortOrder)
    .all();
  const ids = rows.map((row) => row.sectionUuid);
  const periods = readPeriodsOf(db, schema, 'project-section', ids);
  const banners = readEntityBannerUuids(db, schema, 'project-section', ids);

  return orderProjectSections(
    await Promise.all(
      rows.map(async (section) => ({
        sectionUuid: section.sectionUuid,
        title: section.title,
        summary: section.summary,
        humanReadableSlug: section.humanReadableSlug,
        publicId: section.publicId,
        isPrivate: section.isPrivate,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt,
        periods: periods.get(section.sectionUuid) ?? [],
        ...(banners.has(section.sectionUuid)
          ? { bannerAssetUuid: banners.get(section.sectionUuid) }
          : {}),
        content:
          (await THEI_SERVER.content.buildFieldValue(
            'project-section',
            section.sectionUuid,
            'project-section-body',
          )) ?? createEmptyContentFieldValue(),
      })),
    ),
  );
}
