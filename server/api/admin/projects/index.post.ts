import {
  validateProjectData,
  type ProjectEditData,
} from '#layers/thei/shared/admin/project';
import { and, eq } from 'drizzle-orm';
import type { ProjectSaveResponse } from '#layers/thei/shared/api/project';
import { ContentValidationError } from '#layers/thei/shared/content';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';
import { cleanupOrphanExternalLinks } from '../../../thei/external-links/repository';
import { prepareExternalLinks } from '../../../thei/external-links/prepare';
import { validateProjectAssets } from '../../../thei/projects/validate-assets';
import { syncProjectActionUsages } from '../../../thei/projects/action-usages';
import {
  applyPreparedContentSave,
  prepareContentForSave,
} from '../../../thei/content/repository';
import {
  applyProjectContentSections,
  prepareProjectContentSections,
} from '../../../thei/projects/content-sections';
import {
  applyProjectStages,
  prepareProjectStages,
} from '../../../thei/projects/stages';
import {
  ProjectContentItemStorageError,
  projectContentItemIdentities,
} from '../../../thei/projects/content-items';
import { applyRelations, prepareRelations } from '../../../thei/relations';
import { applyTagUsages, prepareTagUsages } from '../../../thei/tags';
import { applyProjectExternalLinks } from '../../../thei/projects/external-links';
import {
  applyStatusEdits,
  getStatusHistory,
  prepareEntityStatusEdits,
  StatusEditError,
  statusUsageHooks,
} from '../../../thei/statuses';

export default defineEventHandler(
  async (event): Promise<ProjectSaveResponse> => {
    const body = await readBody<ProjectEditData>(event);
    const result = validateProjectData(body);
    if (typeof result === 'string') return { type: 'error', message: result };

    const existing = await THEI_SERVER.projects.findByPublicId(result.publicId);
    if (existing)
      return {
        type: 'error',
        code: 'public-id-taken',
        message: THEI_SERVER.phrase.public_id_already_taken,
      };

    const assetError = await validateProjectAssets(result);
    if (assetError) return { type: 'error', message: assetError };

    const projectUuid = await generateUniqueId(
      EntityPrefix.Project,
      async (id) => !(await THEI_SERVER.projects.findByUuid(id)),
    );

    let preparedDescription:
      Awaited<ReturnType<typeof prepareContentForSave>> | undefined;
    if (result.descriptionContent !== undefined) {
      try {
        preparedDescription = await prepareContentForSave(
          'project',
          projectUuid,
          'project-description',
          result.descriptionContent,
        );
      } catch (error) {
        if (error instanceof ContentValidationError) {
          return { type: 'error', message: error.message };
        }
        throw error;
      }
    }

    const preparedNotes = await prepareContentForSave(
      'project',
      projectUuid,
      'project-notes',
      result.notes,
    );

    let preparedSections;
    let preparedStages;
    try {
      preparedStages = await prepareProjectStages(projectUuid, result.stages);
      preparedSections = await prepareProjectContentSections(
        projectUuid,
        result.contentSections,
      );
    } catch (error) {
      if (
        error instanceof ContentValidationError ||
        error instanceof ProjectContentItemStorageError
      ) {
        return { type: 'error', message: error.message };
      }
      throw error;
    }

    let preparedRelations;
    try {
      preparedRelations = await prepareRelations(
        { type: 'project', id: projectUuid },
        result.relations,
      );
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Invalid relations',
      };
    }
    let preparedStatuses;
    try {
      preparedStatuses = prepareEntityStatusEdits(
        { type: 'project', id: projectUuid },
        result,
      );
    } catch (error) {
      if (error instanceof StatusEditError)
        return { type: 'error', message: error.message };
      throw error;
    }

    let preparedTags;
    try {
      preparedTags = await prepareTagUsages(result.tags);
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Invalid tags',
      };
    }
    let preparedExternalLinks;
    try {
      preparedExternalLinks = await prepareExternalLinks(result.externalLinks);
    } catch (error) {
      return {
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Invalid external links',
      };
    }

    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      tx.insert(schema.projects)
        .values({
          projectUuid,
          title: result.title,
          summary: result.summary,
          humanReadableSlug: result.humanReadableSlug,
          publicId: result.publicId,
          access: result.access,
          showcase: result.showcase,
          cv: result.cv,
          action: result.action,
          reminder: result.reminder,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      if (preparedDescription) {
        applyPreparedContentSave(
          tx,
          schema,
          'project',
          projectUuid,
          'project-description',
          preparedDescription,
        );
      }
      applyPreparedContentSave(
        tx,
        schema,
        'project',
        projectUuid,
        'project-notes',
        preparedNotes,
      );
      applyProjectContentSections(tx, schema, projectUuid, preparedSections);
      applyProjectStages(tx, schema, projectUuid, preparedStages);
      applyRelations(
        tx,
        schema,
        { type: 'project', id: projectUuid },
        preparedRelations,
      );
      applyProjectExternalLinks(tx, schema, projectUuid, preparedExternalLinks);
      applyTagUsages(tx, schema, 'project', projectUuid, preparedTags);
      applyStatusEdits(
        tx,
        schema,
        preparedStatuses,
        now,
        statusUsageHooks(tx, schema, now, (message) => {
          throw new StatusEditError(message);
        }),
      );

      if (result.iconAssetUuid) {
        attachUsage(tx, schema, result.iconAssetUuid, projectUuid, 'icon');
      }

      if (result.bannerAssetUuid) {
        attachUsage(tx, schema, result.bannerAssetUuid, projectUuid, 'banner');
      }
      syncProjectActionUsages(tx, schema, [], projectUuid, result.action);

      for (let i = 0; i < (result.showcaseAssets ?? []).length; i++) {
        const item = result.showcaseAssets![i]!;
        attachUsage(tx, schema, item.assetUuid, projectUuid, 'showcase-asset');
        updateUsageMeta(
          tx,
          schema,
          item.assetUuid,
          projectUuid,
          'showcase-asset',
          {
            role: 'showcase-asset',
            order: i,
            caption: item.caption,
            isPrivate: item.isPrivate,
          },
        );
      }

      for (let i = 0; i < (result.otherAssets ?? []).length; i++) {
        const item = result.otherAssets![i]!;
        attachUsage(tx, schema, item.assetUuid, projectUuid, 'other-asset');
        updateUsageMeta(
          tx,
          schema,
          item.assetUuid,
          projectUuid,
          'other-asset',
          {
            role: 'other-asset',
            order: i,
            title: item.title,
            caption: item.caption,
            isPrivate: item.isPrivate,
          },
        );
      }
    });

    await cleanupOrphanExternalLinks();
    return {
      type: 'success',
      projectUuid,
      action: result.action,
      stages: projectContentItemIdentities(
        preparedStages,
        (stage) => stage.stageUuid,
        (stage) => stage.publicId,
      ),
      sections: projectContentItemIdentities(
        preparedSections,
        (section) => section.sectionUuid,
        (section) => section.publicId,
      ),
      statuses: await getStatusHistory(
        { type: 'project', id: projectUuid },
        undefined,
        true,
      ),
    };
  },
);

function attachUsage(
  tx: any,
  schema: any,
  assetUuid: string,
  projectUuid: string,
  role: 'icon' | 'banner' | 'showcase-asset' | 'other-asset',
) {
  tx.insert(schema.assetUsages)
    .values({
      assetUuid,
      containerType: 'project',
      containerId: projectUuid,
      role,
    })
    .onConflictDoNothing()
    .run();
}

function updateUsageMeta(
  tx: any,
  schema: any,
  assetUuid: string,
  projectUuid: string,
  role: 'showcase-asset' | 'other-asset',
  meta: any,
) {
  tx.update(schema.assetUsages)
    .set({ meta })
    .where(
      and(
        eq(schema.assetUsages.assetUuid, assetUuid),
        eq(schema.assetUsages.containerType, 'project'),
        eq(schema.assetUsages.containerId, projectUuid),
        eq(schema.assetUsages.role, role),
      ),
    )
    .run();
}
