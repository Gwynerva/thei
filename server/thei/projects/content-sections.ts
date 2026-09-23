import { eq, inArray } from 'drizzle-orm';
import type { ProjectSectionContentItem } from '#layers/thei/shared/project-content-item';
import { createEmptyContentFieldValue } from '#layers/thei/shared/content';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  applyPreparedContentSave,
  prepareContentForSave,
  type PreparedContentSave,
} from '../content/repository';
import {
  deleteProjectContentItemContent,
  prepareProjectContentItems,
  projectContentItemIdsToRemove,
  projectContentItemUpdatedAt,
  ProjectContentItemStorageError,
} from './content-items';
import type { projectContentSections } from '../db/schema/project-content-sections';

type ProjectContentSectionRow = typeof projectContentSections.$inferSelect;

type PreparedSection = ProjectSectionContentItem & {
  sectionUuid: string;
  contentSave: PreparedContentSave;
};

export async function prepareProjectContentSections(
  projectUuid: string,
  sections: ProjectSectionContentItem[] | undefined,
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
    label: 'content section',
    prepare: async (section, sectionUuid) => {
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

export function applyProjectContentSections(
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
  deleteProjectContentItemContent(tx, schema, 'project-section', removed);
  if (removed.length) {
    tx.delete(schema.projectContentSections)
      .where(inArray(schema.projectContentSections.sectionUuid, removed))
      .run();
  }

  const now = Date.now();
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    const updatedAt = projectContentItemUpdatedAt(
      existingById.get(section.sectionUuid),
      section,
      section.contentSave,
      now,
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

export function deleteProjectContentSections(
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
  if (!ids.length) return;
  tx.delete(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .run();
}

export async function getProjectContentSections(projectUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .orderBy(schema.projectContentSections.sortOrder)
    .all();

  return await Promise.all(
    rows.map(async (section) => ({
      isStage: false as const,
      sectionUuid: section.sectionUuid,
      title: section.title,
      summary: section.summary,
      humanReadableSlug: section.humanReadableSlug,
      publicId: section.publicId,
      isPrivate: section.isPrivate,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      content:
        (await THEI_SERVER.content.buildFieldValue(
          'project-section',
          section.sectionUuid,
          'project-section-body',
        )) ?? createEmptyContentFieldValue(),
    })),
  );
}
