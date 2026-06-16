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
  dominantHueFromMeta,
} from '../../../thei/assets/urls';
import {
  applyPreparedContentSave,
  deleteContentForOwner,
  prepareContentForSave,
} from '../../../thei/content/repository';
import { validateProjectAssets } from '../../../thei/projects/validate-assets';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'projectUuid')!;
  const project =
    (await THEI_SERVER.projects.findByUuid(identifier)) ??
    (await THEI_SERVER.projects.findBySlug(identifier));

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

      let iconPreviewUrl: string | undefined;
      let iconVideoUrl: string | undefined;
      if (iconUsage) {
        const urls = await buildAdminAssetUrls(iconUsage.asset);
        iconPreviewUrl = urls.previewUrl;
        iconVideoUrl = urls.videoUrl;
      }

      let bannerPreviewUrl: string | undefined;
      let bannerVideoUrl: string | undefined;
      if (bannerUsage) {
        const urls = await buildAdminAssetUrls(bannerUsage.asset);
        bannerPreviewUrl = urls.previewUrl;
        bannerVideoUrl = urls.videoUrl;
      }

      const rawShowcase =
        await THEI_SERVER.assets.usages.findShowcase(projectUuid);

      const showcaseAssets: ShowcaseAssetGetItem[] = await Promise.all(
        rawShowcase.map(async ({ asset, meta }) => {
          const isVideo = asset.type === AssetType.Video;
          const urls = await buildAdminAssetUrls(asset);

          return {
            assetUuid: asset.assetUuid,
            type: asset.type as AssetType,
            previewUrl: urls.previewUrl ?? urls.assetUrl,
            videoUrl: isVideo ? urls.videoUrl : undefined,
            caption: meta?.role === 'showcase-asset' ? meta.caption : undefined,
            isPrivate: meta?.role === 'showcase-asset' ? meta.isPrivate : false,
            size: asset.size,
          };
        }),
      );

      const rawOther = await THEI_SERVER.assets.usages.findOther(projectUuid);

      const otherAssets: OtherAssetGetItem[] = await Promise.all(
        rawOther.map(async ({ asset, meta }) => {
          const urls = await buildAdminAssetUrls(asset);

          return {
            assetUuid: asset.assetUuid,
            previewUrl: urls.previewUrl,
            videoUrl: urls.videoUrl,
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
        slug: project.slug,
        access: project.access,
        important: project.important,
        cv: project.cv,
        iconAssetUuid: iconUsage?.asset.assetUuid,
        iconPreviewUrl,
        iconVideoUrl,
        iconDominantHue: dominantHueFromMeta(iconUsage?.asset.meta),
        iconAssetSize: iconUsage?.asset.size,
        bannerAssetUuid: bannerUsage?.asset.assetUuid,
        bannerPreviewUrl,
        bannerVideoUrl,
        bannerAssetSize: bannerUsage?.asset.size,
        descriptionContent: await THEI_SERVER.content.buildFieldValue(
          'project',
          projectUuid,
          'project-description',
        ),
        showcaseAssets,
        otherAssets,
      } satisfies ProjectGetResponse;
    }

    case 'PUT': {
      const body = await readBody<ProjectEditData>(event);
      const result = validateProjectData(body);
      if (typeof result === 'string')
        return { type: 'error', message: result } satisfies ProjectSaveResponse;

      const existing = await THEI_SERVER.projects.findBySlug(
        result.slug,
        projectUuid,
      );
      if (existing)
        return {
          type: 'error',
          message: 'Slug is already taken',
        } satisfies ProjectSaveResponse;

      const assetError = await validateProjectAssets(result);
      if (assetError)
        return {
          type: 'error',
          message: assetError,
        } satisfies ProjectSaveResponse;

      let preparedDescription:
        | Awaited<ReturnType<typeof prepareContentForSave>>
        | undefined;
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
            slug: result.slug,
            access: result.access,
            important: result.important,
            cv: result.cv,
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

      return { type: 'success', projectUuid } satisfies ProjectSaveResponse;
    }

    case 'DELETE': {
      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      const { db, schema } = THEI_SERVER.useDb();
      db.transaction((tx) => {
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
      return;
    }
  }
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
