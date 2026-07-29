import { and, eq, inArray } from 'drizzle-orm';
import type { ProjectContentSectionEditItem } from '#layers/thei/shared/project-content-section';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  applyPreparedContentSave,
  deleteContentForOwner,
  prepareContentForSave,
  type PreparedContentSave,
} from '../content/repository';

type PreparedSection = ProjectContentSectionEditItem & {
  sectionUuid: string;
  contentSave?: PreparedContentSave;
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
  const submittedIds = new Set<string>();

  return await Promise.all(
    sections.map(async (section) => {
      const sectionUuid =
        section.sectionUuid ??
        (await generateUniqueId(
          EntityPrefix.ProjectContentSection,
          async (id) =>
            !db
              .select({
                sectionUuid: schema.projectContentSections.sectionUuid,
              })
              .from(schema.projectContentSections)
              .where(eq(schema.projectContentSections.sectionUuid, id))
              .get(),
        ));
      if (submittedIds.has(sectionUuid))
        throw new Error('Duplicate content section');
      submittedIds.add(sectionUuid);
      if (section.sectionUuid && !existingIds.has(sectionUuid)) {
        throw new Error('Unknown content section');
      }
      const contentSave =
        section.content === undefined
          ? undefined
          : await prepareContentForSave(
              'project-section',
              sectionUuid,
              'project-section-body',
              section.content,
            );
      return { ...section, sectionUuid, contentSave };
    }),
  );
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
  const nextIds = new Set(sections.map((section) => section.sectionUuid));
  const removed = existing
    .map((item: { sectionUuid: string }) => item.sectionUuid)
    .filter((sectionUuid: string) => !nextIds.has(sectionUuid));
  for (const sectionUuid of removed) {
    deleteContentForOwner(tx, schema, 'project-section', sectionUuid);
  }
  if (removed.length) {
    tx.delete(schema.projectContentSectionPeriods)
      .where(inArray(schema.projectContentSectionPeriods.sectionUuid, removed))
      .run();
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
    tx.delete(schema.projectContentSectionPeriods)
      .where(
        eq(
          schema.projectContentSectionPeriods.sectionUuid,
          section.sectionUuid,
        ),
      )
      .run();
    for (
      let periodIndex = 0;
      periodIndex < section.periods.length;
      periodIndex++
    ) {
      const period = section.periods[periodIndex]!;
      tx.insert(schema.projectContentSectionPeriods)
        .values({
          ...period,
          sectionUuid: section.sectionUuid,
          sortOrder: periodIndex,
        })
        .run();
    }
    if (section.contentSave) {
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
  for (const sectionUuid of ids)
    deleteContentForOwner(tx, schema, 'project-section', sectionUuid);
  if (!ids.length) return;
  tx.delete(schema.projectContentSectionPeriods)
    .where(inArray(schema.projectContentSectionPeriods.sectionUuid, ids))
    .run();
  tx.delete(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .run();
}
