import { eq, inArray } from 'drizzle-orm';
import type { ProjectStageEditItem } from '#layers/thei/shared/project-stage';
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

type PreparedStage = ProjectStageEditItem & {
  stageUuid: string;
  contentSave?: PreparedContentSave;
};

export async function prepareProjectStages(
  projectUuid: string,
  stages: ProjectStageEditItem[] | undefined,
): Promise<PreparedStage[] | undefined> {
  if (stages === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const existingIds = new Set(
    db
      .select({ stageUuid: schema.projectStages.stageUuid })
      .from(schema.projectStages)
      .where(eq(schema.projectStages.projectUuid, projectUuid))
      .all()
      .map((item) => item.stageUuid),
  );
  return prepareProjectStructuredItems(stages, {
    existingIds,
    getId: (stage) => stage.stageUuid,
    createId: () =>
      generateUniqueId(
        EntityPrefix.ProjectStage,
        async (id) =>
          !db
            .select({ stageUuid: schema.projectStages.stageUuid })
            .from(schema.projectStages)
            .where(eq(schema.projectStages.stageUuid, id))
            .get(),
      ),
    label: 'stage',
    prepare: async (stage, stageUuid) => {
      const contentSave =
        stage.content === undefined
          ? undefined
          : await prepareContentForSave(
              'project-stage',
              stageUuid,
              'project-stage-body',
              stage.content,
            );
      return { ...stage, stageUuid, contentSave };
    },
  });
}

export function applyProjectStages(
  tx: any,
  schema: any,
  projectUuid: string,
  stages: PreparedStage[] | undefined,
) {
  if (stages === undefined) return;
  const existingIds = tx
    .select({ stageUuid: schema.projectStages.stageUuid })
    .from(schema.projectStages)
    .where(eq(schema.projectStages.projectUuid, projectUuid))
    .all()
    .map((item: { stageUuid: string }) => item.stageUuid);
  const removed = projectStructuredItemIdsToRemove(
    existingIds,
    stages.map((stage) => stage.stageUuid),
  );
  deleteProjectStructuredItemContent(tx, schema, 'project-stage', removed);
  if (removed.length)
    tx.delete(schema.projectStages)
      .where(inArray(schema.projectStages.stageUuid, removed))
      .run();

  const now = Date.now();
  for (const stage of stages) {
    tx.insert(schema.projectStages)
      .values({
        stageUuid: stage.stageUuid,
        projectUuid,
        title: stage.title,
        summary: stage.summary,
        isPrivate: stage.isPrivate,
        startDate: stage.period.startDate,
        endDate: stage.period.endDate,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.projectStages.stageUuid,
        set: {
          title: stage.title,
          summary: stage.summary,
          isPrivate: stage.isPrivate,
          startDate: stage.period.startDate,
          endDate: stage.period.endDate,
          updatedAt: now,
        },
      })
      .run();
    if (stage.contentSave)
      applyPreparedContentSave(
        tx,
        schema,
        'project-stage',
        stage.stageUuid,
        'project-stage-body',
        stage.contentSave,
      );
  }
}

export function deleteProjectStages(tx: any, schema: any, projectUuid: string) {
  const ids = tx
    .select({ stageUuid: schema.projectStages.stageUuid })
    .from(schema.projectStages)
    .where(eq(schema.projectStages.projectUuid, projectUuid))
    .all()
    .map((row: { stageUuid: string }) => row.stageUuid);
  deleteProjectStructuredItemContent(tx, schema, 'project-stage', ids);
  if (ids.length)
    tx.delete(schema.projectStages)
      .where(eq(schema.projectStages.projectUuid, projectUuid))
      .run();
}

export async function getProjectStages(projectUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.projectStages)
    .where(eq(schema.projectStages.projectUuid, projectUuid))
    .orderBy(schema.projectStages.startDate, schema.projectStages.endDate)
    .all();

  return await Promise.all(
    rows.map(async (stage) => ({
      stageUuid: stage.stageUuid,
      title: stage.title,
      summary: stage.summary,
      isPrivate: stage.isPrivate,
      period: { startDate: stage.startDate, endDate: stage.endDate },
      content: await THEI_SERVER.content.buildFieldValue(
        'project-stage',
        stage.stageUuid,
        'project-stage-body',
      ),
    })),
  );
}
