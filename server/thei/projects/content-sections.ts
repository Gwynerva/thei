import { eq, inArray } from 'drizzle-orm';
import type { ProjectContentSectionEditItem } from '#layers/thei/shared/project-content-section';
import { createEmptyContentFieldValue } from '#layers/thei/shared/content';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  applyPreparedContentSave,
  prepareContentForSave,
  type PreparedContentSave,
} from '../content/repository';
import {
  deleteProjectStructuredItemContent,
  prepareProjectStructuredItems,
  projectStructuredItemIdsToRemove,
} from './structured-items';

type PreparedSection = ProjectContentSectionEditItem & {
  sectionUuid: string;
  contentSave: PreparedContentSave;
};

export async function prepareProjectContentSections(
  projectUuid: string,
  sections: ProjectContentSectionEditItem[] | undefined,
): Promise<PreparedSection[] | undefined> {
  if (sections === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const existing = db
    .select({ sectionUuid: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .all();
  const existingIds = new Set(existing.map((item) => item.sectionUuid));
  return prepareProjectStructuredItems(sections, {
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
  const existing = tx
    .select({ sectionUuid: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .all();
  const removed = projectStructuredItemIdsToRemove(
    existing.map((item: { sectionUuid: string }) => item.sectionUuid),
    sections.map((section) => section.sectionUuid),
  );
  deleteProjectStructuredItemContent(tx, schema, 'project-section', removed);
  if (removed.length) {
    tx.delete(schema.projectContentSections)
      .where(inArray(schema.projectContentSections.sectionUuid, removed))
      .run();
  }

  const now = Date.now();
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    tx.insert(schema.projectContentSections)
      .values({
        sectionUuid: section.sectionUuid,
        projectUuid,
        title: section.title,
        summary: section.summary,
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
          isPrivate: section.isPrivate,
          sortOrder: index,
          updatedAt: now,
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
  deleteProjectStructuredItemContent(tx, schema, 'project-section', ids);
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
      sectionUuid: section.sectionUuid,
      title: section.title,
      summary: section.summary,
      isPrivate: section.isPrivate,
      content:
        (await THEI_SERVER.content.buildFieldValue(
          'project-section',
          section.sectionUuid,
          'project-section-body',
        )) ?? createEmptyContentFieldValue(),
    })),
  );
}
