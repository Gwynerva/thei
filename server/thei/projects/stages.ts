import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  compareProjectStages,
  type ProjectStageContentItem,
} from '#layers/thei/shared/project-content-item';
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
import type { projectStages } from '../db/schema/project-content-sections';
import {
  deleteStagePeriods,
  readStagePeriods,
  replaceStagePeriods,
  stagePeriodsEqual,
} from './stage-periods';

type ProjectStageRow = typeof projectStages.$inferSelect;

type PreparedStage = ProjectStageContentItem & {
  stageUuid: string;
  contentSave?: PreparedContentSave;
};

export async function prepareProjectStages(
  projectUuid: string,
  stages: ProjectStageContentItem[] | undefined,
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
  const publicIds = stages.map((stage) => stage.publicId);
  if (new Set(publicIds).size !== publicIds.length)
    throw new ProjectContentItemStorageError('Duplicate stage public ID');
  if (publicIds.length) {
    const submittedIds = new Set(
      stages.map((stage) => stage.stageUuid).filter(Boolean),
    );
    const collision = db
      .select({ stageUuid: schema.projectStages.stageUuid })
      .from(schema.projectStages)
      .where(inArray(schema.projectStages.publicId, publicIds))
      .all()
      .find((stage) => !submittedIds.has(stage.stageUuid));
    if (collision)
      throw new ProjectContentItemStorageError(
        'Stage public ID is already taken',
      );
  }
  return prepareProjectContentItems(stages, {
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
  const existing: ProjectStageRow[] = tx
    .select()
    .from(schema.projectStages)
    .where(eq(schema.projectStages.projectUuid, projectUuid))
    .all();
  const existingById = new Map(existing.map((row) => [row.stageUuid, row]));
  const removed = projectContentItemIdsToRemove(
    existing.map((row) => row.stageUuid),
    stages.map((stage) => stage.stageUuid),
  );
  deleteProjectContentItemContent(tx, schema, 'project-stage', removed);
  deleteStagePeriods(tx, schema, 'project-stage', removed);
  if (removed.length)
    tx.delete(schema.projectStages)
      .where(inArray(schema.projectStages.stageUuid, removed))
      .run();

  const now = Date.now();
  for (const stage of stages) {
    const stored = existingById.get(stage.stageUuid);
    const updatedAt = projectContentItemUpdatedAt(
      stored,
      stage,
      stage.contentSave,
      now,
      Boolean(stored) &&
        !stagePeriodsEqual(
          readStagePeriods(tx, schema, 'project-stage', stage.stageUuid),
          stage.periods,
        ),
    );
    tx.insert(schema.projectStages)
      .values({
        stageUuid: stage.stageUuid,
        projectUuid,
        title: stage.title,
        summary: stage.summary,
        humanReadableSlug: stage.humanReadableSlug,
        publicId: stage.publicId,
        isPrivate: stage.isPrivate,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.projectStages.stageUuid,
        set: {
          title: stage.title,
          summary: stage.summary,
          humanReadableSlug: stage.humanReadableSlug,
          publicId: stage.publicId,
          isPrivate: stage.isPrivate,
          updatedAt,
        },
      })
      .run();
    replaceStagePeriods(
      tx,
      schema,
      'project-stage',
      stage.stageUuid,
      stage.periods,
    );
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
  deleteProjectContentItemContent(tx, schema, 'project-stage', ids);
  deleteStagePeriods(tx, schema, 'project-stage', ids);
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
    .all();

  const stageIds = rows.map((stage) => stage.stageUuid);
  const periods = stageIds.length
    ? db
        .select()
        .from(schema.stagePeriods)
        .where(
          and(
            eq(schema.stagePeriods.stageType, 'project-stage'),
            inArray(schema.stagePeriods.stageUuid, stageIds),
          ),
        )
        .orderBy(
          asc(schema.stagePeriods.startDate),
          asc(schema.stagePeriods.endDate),
        )
        .all()
    : [];
  const periodsByStage = Map.groupBy(periods, (period) => period.stageUuid);

  return (
    await Promise.all(
      rows.map(async (stage) => ({
        isStage: true as const,
        stageUuid: stage.stageUuid,
        title: stage.title,
        summary: stage.summary,
        humanReadableSlug: stage.humanReadableSlug,
        publicId: stage.publicId,
        isPrivate: stage.isPrivate,
        createdAt: stage.createdAt,
        updatedAt: stage.updatedAt,
        periods: (periodsByStage.get(stage.stageUuid) ?? []).map(
          ({ startDate, endDate, precision, precisionNote }) => ({
            startDate,
            endDate,
            precision,
            precisionNote,
          }),
        ),
        content: await THEI_SERVER.content.buildFieldValue(
          'project-stage',
          stage.stageUuid,
          'project-stage-body',
        ),
      })),
    )
  ).sort(compareProjectStages);
}
