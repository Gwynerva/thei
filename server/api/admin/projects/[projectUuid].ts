import {
  validateProjectData,
  type ProjectEditData,
} from '#layers/thei/shared/admin/project';
import type {
  OtherAssetGetItem,
  ProjectGetResponse,
  ProjectSaveResponse,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import { AssetType, type AssetRole } from '#layers/thei/shared/asset';
import { ContentValidationError } from '#layers/thei/shared/content';
import { and, eq } from 'drizzle-orm';
import {
  archivedOriginalFromMeta,
  buildAdminAssetUrls,
} from '../../../thei/assets/urls';
import { resolveGeneratedIcon } from '../../../thei/media/generated-icon';
import {
  cleanupOrphanExternalLinks,
  findExternalLink,
} from '../../../thei/external-links/repository';
import {
  applyPreparedContentSave,
  deleteContentForOwner,
  prepareContentForSave,
} from '../../../thei/content/repository';
import { validateProjectAssets } from '../../../thei/projects/validate-assets';
import { syncProjectActionUsages } from '../../../thei/projects/action-usages';
import {
  applyProjectContentSections,
  deleteProjectContentSections,
  getProjectContentSections,
  prepareProjectContentSections,
} from '../../../thei/projects/content-sections';
import {
  applyProjectStages,
  deleteProjectStages,
  getProjectStages,
  prepareProjectStages,
} from '../../../thei/projects/stages';
import { ProjectContentItemStorageError } from '../../../thei/projects/content-items';
import {
  applyProjectRelations,
  deleteProjectRelations,
  getProjectRelations,
  prepareProjectRelations,
} from '../../../thei/projects/relations';
import {
  applyProjectExternalLinks,
  deleteProjectExternalLinks,
  getProjectExternalLinks,
  prepareProjectExternalLinks,
} from '../../../thei/projects/external-links';
import {
  applyTagUsages,
  deleteTagUsagesForContainer,
  listTagsForContainer,
  prepareTagUsages,
} from '../../../thei/tags';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'projectUuid')!;
  const project =
    (await THEI_SERVER.projects.findByUuid(identifier)) ??
    (await THEI_SERVER.projects.findByPublicId(identifier));

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  const projectUuid = project.projectUuid;

  switch (event.method) {
    case 'GET': {
      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      const iconUsage = usages.find((u) => u.role === 'icon');
      const bannerUsage = usages.find((u) => u.role === 'banner');
      const actionIconUsage = usages.find((u) => u.role === 'action-icon');
      const actionBackgroundUsage = usages.find(
        (u) => u.role === 'action-background',
      );
      const actionFileUsage = usages.find((u) => u.role === 'action-file');

      const [
        iconUrls,
        bannerUrls,
        actionIconUrls,
        actionBackgroundUrls,
        actionFileUrls,
        actionLink,
      ] = await Promise.all([
        iconUsage ? buildAdminAssetUrls(iconUsage.asset) : undefined,
        bannerUsage ? buildAdminAssetUrls(bannerUsage.asset) : undefined,
        actionIconUsage
          ? buildAdminAssetUrls(actionIconUsage.asset)
          : undefined,
        actionBackgroundUsage
          ? buildAdminAssetUrls(actionBackgroundUsage.asset)
          : undefined,
        actionFileUsage
          ? buildAdminAssetUrls(actionFileUsage.asset)
          : undefined,
        project.action?.externalUrl
          ? findExternalLink(project.action.externalUrl)
          : undefined,
      ]);
      const iconMedia =
        iconUrls?.media ?? resolveGeneratedIcon('project', projectUuid);
      const bannerMedia = bannerUrls?.media;

      const rawShowcase =
        await THEI_SERVER.assets.usages.findShowcase(projectUuid);

      const showcaseAssets: ShowcaseAssetGetItem[] = await Promise.all(
        rawShowcase.map(async ({ asset, meta }) => {
          const urls = await buildAdminAssetUrls(asset);

          return {
            assetUuid: asset.assetUuid,
            type: asset.type as AssetType,
            media: urls.media!,
            caption: meta?.role === 'showcase-asset' ? meta.caption : undefined,
            isPrivate: meta?.role === 'showcase-asset' ? meta.isPrivate : false,
            size: asset.size,
          };
        }),
      );

      const rawOther = await THEI_SERVER.assets.usages.findOther(projectUuid);

      const [contentSections, stages] = await Promise.all([
        getProjectContentSections(projectUuid),
        getProjectStages(projectUuid),
      ]);

      const otherAssets: OtherAssetGetItem[] = await Promise.all(
        rawOther.map(async ({ asset, meta }) => {
          const urls = await buildAdminAssetUrls(asset);

          return {
            assetUuid: asset.assetUuid,
            media: urls.media,
            assetUrl: urls.assetUrl,
            size: asset.size,
            extension: asset.extension,
            archivedOriginal:
              asset.type === AssetType.Other
                ? archivedOriginalFromMeta(asset.meta)
                : undefined,
            title: meta?.role === 'other-asset' ? (meta.title ?? '') : '',
            caption: meta?.role === 'other-asset' ? meta.caption : undefined,
            isPrivate: meta?.role === 'other-asset' ? meta.isPrivate : false,
          };
        }),
      );

      return {
        projectUuid: project.projectUuid,
        title: project.title,
        summary: project.summary,
        humanReadableSlug: project.humanReadableSlug,
        publicId: project.publicId,
        access: project.access,
        showcase: project.showcase,
        cv: project.cv,
        iconAssetUuid: iconUsage?.asset.assetUuid,
        iconMedia,
        iconAssetSize: iconUsage?.asset.size,
        bannerAssetUuid: bannerUsage?.asset.assetUuid,
        bannerMedia,
        bannerAssetSize: bannerUsage?.asset.size,
        action: project.action ?? undefined,
        actionIconMedia: actionIconUrls?.media,
        actionIconAssetSize: actionIconUsage?.asset.size,
        actionBackgroundMedia: actionBackgroundUrls?.media,
        actionBackgroundAssetSize: actionBackgroundUsage?.asset.size,
        actionFileUrl: actionFileUrls?.assetUrl,
        actionFileMedia: actionFileUrls?.media,
        actionFileExtension: actionFileUsage?.asset.extension,
        actionFileSize: actionFileUsage?.asset.size,
        actionFaviconMedia: actionLink?.faviconMedia,
        descriptionContent: await THEI_SERVER.content.buildFieldValue(
          'project',
          projectUuid,
          'project-description',
        ),
        contentSections,
        stages,
        showcaseAssets,
        otherAssets,
        relations: await getProjectRelations(projectUuid),
        externalLinks: await getProjectExternalLinks(projectUuid),
        tags: await listTagsForContainer('project', projectUuid),
      } satisfies ProjectGetResponse;
    }

    case 'PUT': {
      const body = await readBody<ProjectEditData>(event);
      const result = validateProjectData(body);
      if (typeof result === 'string')
        return { type: 'error', message: result } satisfies ProjectSaveResponse;

      const existing = await THEI_SERVER.projects.findByPublicId(
        result.publicId,
        projectUuid,
      );
      if (existing)
        return {
          type: 'error',
          code: 'public-id-taken',
          message: THEI_SERVER.phrase.public_id_already_taken,
        } satisfies ProjectSaveResponse;

      const assetError = await validateProjectAssets(result);
      if (assetError)
        return {
          type: 'error',
          message: assetError,
        } satisfies ProjectSaveResponse;

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
            return {
              type: 'error',
              message: error.message,
            } satisfies ProjectSaveResponse;
          }
          throw error;
        }
      }

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
          return {
            type: 'error',
            message: error.message,
          } satisfies ProjectSaveResponse;
        }
        throw error;
      }

      let preparedRelations;
      try {
        preparedRelations = await prepareProjectRelations(
          projectUuid,
          result.relations,
        );
      } catch (error) {
        return {
          type: 'error',
          message: error instanceof Error ? error.message : 'Invalid relations',
        } satisfies ProjectSaveResponse;
      }
      let preparedTags;
      try {
        preparedTags = await prepareTagUsages(result.tags);
      } catch (error) {
        return {
          type: 'error',
          message: error instanceof Error ? error.message : 'Invalid tags',
        } satisfies ProjectSaveResponse;
      }
      let preparedExternalLinks;
      try {
        preparedExternalLinks = await prepareProjectExternalLinks(
          result.externalLinks,
        );
      } catch (error) {
        return {
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Invalid external links',
        } satisfies ProjectSaveResponse;
      }

      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      const currentIcon = usages.find((u) => u.role === 'icon');
      const newIconUuid = result.iconAssetUuid;
      const currentBanner = usages.find((u) => u.role === 'banner');
      const newBannerUuid = result.bannerAssetUuid;

      const currentShowcase =
        await THEI_SERVER.assets.usages.findShowcase(projectUuid);
      const currentShowcaseUuids = new Set(
        currentShowcase.map((s) => s.asset.assetUuid),
      );
      const newShowcase = result.showcaseAssets ?? [];
      const newShowcaseUuids = new Set(newShowcase.map((s) => s.assetUuid));

      const currentOther =
        await THEI_SERVER.assets.usages.findOther(projectUuid);
      const currentOtherUuids = new Set(
        currentOther.map((o) => o.asset.assetUuid),
      );
      const newOther = result.otherAssets ?? [];
      const newOtherUuids = new Set(newOther.map((o) => o.assetUuid));

      const { db, schema } = THEI_SERVER.useDb();
      db.transaction((tx) => {
        tx.update(schema.projects)
          .set({
            title: result.title,
            summary: result.summary,
            humanReadableSlug: result.humanReadableSlug,
            publicId: result.publicId,
            access: result.access,
            showcase: result.showcase,
            cv: result.cv,
            action: result.action,
            updatedAt: Date.now(),
          })
          .where(eq(schema.projects.projectUuid, projectUuid))
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
        applyProjectContentSections(tx, schema, projectUuid, preparedSections);
        applyProjectStages(tx, schema, projectUuid, preparedStages);
        applyProjectRelations(tx, schema, projectUuid, preparedRelations);
        applyProjectExternalLinks(
          tx,
          schema,
          projectUuid,
          preparedExternalLinks,
        );
        applyTagUsages(tx, schema, 'project', projectUuid, preparedTags);

        if (currentIcon?.asset.assetUuid !== newIconUuid) {
          if (currentIcon) {
            detachUsage(
              tx,
              schema,
              currentIcon.asset.assetUuid,
              projectUuid,
              'icon',
            );
          }
          if (newIconUuid) {
            attachUsage(tx, schema, newIconUuid, projectUuid, 'icon');
          }
        }

        if (currentBanner?.asset.assetUuid !== newBannerUuid) {
          if (currentBanner) {
            detachUsage(
              tx,
              schema,
              currentBanner.asset.assetUuid,
              projectUuid,
              'banner',
            );
          }
          if (newBannerUuid) {
            attachUsage(tx, schema, newBannerUuid, projectUuid, 'banner');
          }
        }

        syncProjectActionUsages(tx, schema, usages, projectUuid, result.action);

        for (const { asset } of currentShowcase) {
          if (!newShowcaseUuids.has(asset.assetUuid)) {
            detachUsage(
              tx,
              schema,
              asset.assetUuid,
              projectUuid,
              'showcase-asset',
            );
          }
        }

        for (let i = 0; i < newShowcase.length; i++) {
          const item = newShowcase[i]!;
          if (!currentShowcaseUuids.has(item.assetUuid)) {
            attachUsage(
              tx,
              schema,
              item.assetUuid,
              projectUuid,
              'showcase-asset',
            );
          }
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

        for (const { asset } of currentOther) {
          if (!newOtherUuids.has(asset.assetUuid)) {
            detachUsage(
              tx,
              schema,
              asset.assetUuid,
              projectUuid,
              'other-asset',
            );
          }
        }

        for (let i = 0; i < newOther.length; i++) {
          const item = newOther[i]!;
          if (!currentOtherUuids.has(item.assetUuid)) {
            attachUsage(tx, schema, item.assetUuid, projectUuid, 'other-asset');
          }
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
      } satisfies ProjectSaveResponse;
    }

    case 'DELETE': {
      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      const { db, schema } = THEI_SERVER.useDb();
      db.transaction((tx) => {
        deleteProjectContentSections(tx, schema, projectUuid);
        deleteProjectStages(tx, schema, projectUuid);
        deleteProjectRelations(tx, schema, projectUuid);
        deleteProjectExternalLinks(tx, schema, projectUuid);
        deleteTagUsagesForContainer(tx, schema, 'project', projectUuid);
        deleteContentForOwner(tx, schema, 'project', projectUuid);

        for (const usage of usages) {
          detachUsage(
            tx,
            schema,
            usage.asset.assetUuid,
            projectUuid,
            usage.role,
          );
        }
        tx.delete(schema.projects)
          .where(eq(schema.projects.projectUuid, projectUuid))
          .run();
      });
      await cleanupOrphanExternalLinks();
      return;
    }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});

function attachUsage(
  tx: any,
  schema: any,
  assetUuid: string,
  projectUuid: string,
  role: AssetRole,
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

function detachUsage(
  tx: any,
  schema: any,
  assetUuid: string,
  projectUuid: string,
  role: AssetRole,
) {
  tx.delete(schema.assetUsages)
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
