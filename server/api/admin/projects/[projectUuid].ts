import {
  validateProjectData,
  type ProjectEditData,
} from '#layers/thei/shared/admin/project';
import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import type {
  OtherAssetGetItem,
  ProjectGetResponse,
  ProjectSaveResponse,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import { AssetType } from '#layers/thei/shared/asset';

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

      // Resolve icon URLs (image or video)
      let iconPreviewUrl: string | undefined;
      let iconVideoUrl: string | undefined;
      if (iconUsage) {
        const iconAsset = iconUsage.asset;
        if (
          iconAsset.type === AssetType.Video &&
          iconAsset.meta?.previewAssetUuid
        ) {
          const thumb = await THEI_SERVER.assets.findByUuid(
            iconAsset.meta.previewAssetUuid,
          );
          iconPreviewUrl = thumb
            ? buildAssetPreviewUrl(thumb.slug, 'webp')
            : buildAssetPreviewUrl(iconAsset.slug, iconAsset.extension);
          iconVideoUrl = buildAssetPreviewUrl(
            iconAsset.slug,
            iconAsset.extension,
          );
        } else if (iconUsage) {
          iconPreviewUrl = buildAssetPreviewUrl(
            iconAsset.slug,
            iconAsset.extension,
          );
        }
      }

      // Resolve banner URLs (image or video)
      let bannerPreviewUrl: string | undefined;
      let bannerVideoUrl: string | undefined;
      if (bannerUsage) {
        const bannerAsset = bannerUsage.asset;
        if (
          bannerAsset.type === AssetType.Video &&
          bannerAsset.meta?.previewAssetUuid
        ) {
          const thumb = await THEI_SERVER.assets.findByUuid(
            bannerAsset.meta.previewAssetUuid,
          );
          bannerPreviewUrl = thumb
            ? buildAssetPreviewUrl(thumb.slug, 'webp')
            : buildAssetPreviewUrl(bannerAsset.slug, bannerAsset.extension);
          bannerVideoUrl = buildAssetPreviewUrl(
            bannerAsset.slug,
            bannerAsset.extension,
          );
        } else {
          bannerPreviewUrl = buildAssetPreviewUrl(
            bannerAsset.slug,
            bannerAsset.extension,
          );
        }
      }

      const rawShowcase =
        await THEI_SERVER.assets.usages.findShowcase(projectUuid);

      const showcaseAssets: ShowcaseAssetGetItem[] = await Promise.all(
        rawShowcase.map(async ({ asset, meta }) => {
          const isVideo = asset.type === AssetType.Video;
          let previewUrl: string;

          if (isVideo && asset.meta?.previewAssetUuid) {
            const thumb = await THEI_SERVER.assets.findByUuid(
              asset.meta.previewAssetUuid,
            );
            previewUrl = thumb
              ? buildAssetPreviewUrl(thumb.slug, 'webp')
              : buildAssetPreviewUrl(asset.slug, asset.extension);
          } else {
            previewUrl = buildAssetPreviewUrl(asset.slug, asset.extension);
          }

          return {
            assetUuid: asset.assetUuid,
            type: asset.type as AssetType,
            previewUrl,
            videoUrl: isVideo
              ? buildAssetPreviewUrl(asset.slug, asset.extension)
              : undefined,
            caption: meta?.role === 'showcase-asset' ? meta.caption : undefined,
            access: meta?.role === 'showcase-asset' ? meta.access : 'project',
            size: asset.size,
          };
        }),
      );

      const rawOther = await THEI_SERVER.assets.usages.findOther(projectUuid);

      const otherAssets: OtherAssetGetItem[] = await Promise.all(
        rawOther.map(async ({ asset, meta }) => {
          const assetUrl = buildAssetPreviewUrl(asset.slug, asset.extension);
          const isVideo = asset.type === AssetType.Video;
          const isImage = asset.type === AssetType.Image;

          let previewUrl: string | undefined;
          let videoUrl: string | undefined;

          if (isVideo && asset.meta?.previewAssetUuid) {
            const thumb = await THEI_SERVER.assets.findByUuid(
              asset.meta.previewAssetUuid,
            );
            previewUrl = thumb
              ? buildAssetPreviewUrl(thumb.slug, 'webp')
              : undefined;
            videoUrl = assetUrl;
          } else if (isImage) {
            previewUrl = assetUrl;
          }

          return {
            assetUuid: asset.assetUuid,
            previewUrl,
            videoUrl,
            assetUrl,
            size: asset.size,
            extension: asset.extension,
            title: meta?.role === 'other-asset' ? meta.title : undefined,
            caption: meta?.role === 'other-asset' ? meta.caption : undefined,
            access: meta?.role === 'other-asset' ? meta.access : 'project',
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
        iconDominantHue: iconUsage?.asset.meta?.dominantHue,
        iconAssetSize: iconUsage?.asset.size,
        bannerAssetUuid: bannerUsage?.asset.assetUuid,
        bannerPreviewUrl,
        bannerVideoUrl,
        bannerAssetSize: bannerUsage?.asset.size,
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

      await THEI_SERVER.projects.update(projectUuid, {
        title: result.title,
        summary: result.summary,
        slug: result.slug,
        access: result.access,
        important: result.important,
        cv: result.cv,
      });

      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      const currentIcon = usages.find((u) => u.role === 'icon');
      const newIconUuid = result.iconAssetUuid;

      if (currentIcon?.asset.assetUuid !== newIconUuid) {
        if (currentIcon) {
          await THEI_SERVER.assets.usages.detach(
            currentIcon.asset.assetUuid,
            'project',
            projectUuid,
            'icon',
          );
        }
        if (newIconUuid) {
          await THEI_SERVER.assets.usages.attach(
            newIconUuid,
            'project',
            projectUuid,
            'icon',
          );
        }
      }

      const currentBanner = usages.find((u) => u.role === 'banner');
      const newBannerUuid = result.bannerAssetUuid;

      if (currentBanner?.asset.assetUuid !== newBannerUuid) {
        if (currentBanner) {
          await THEI_SERVER.assets.usages.detach(
            currentBanner.asset.assetUuid,
            'project',
            projectUuid,
            'banner',
          );
        }
        if (newBannerUuid) {
          await THEI_SERVER.assets.usages.attach(
            newBannerUuid,
            'project',
            projectUuid,
            'banner',
          );
        }
      }

      // Reconcile showcase assets
      const currentShowcase =
        await THEI_SERVER.assets.usages.findShowcase(projectUuid);
      const currentShowcaseUuids = new Set(
        currentShowcase.map((s) => s.asset.assetUuid),
      );
      const newShowcase = result.showcaseAssets ?? [];
      const newShowcaseUuids = new Set(newShowcase.map((s) => s.assetUuid));

      // Detach removed showcase assets (and their previews)
      for (const { asset } of currentShowcase) {
        if (!newShowcaseUuids.has(asset.assetUuid)) {
          await THEI_SERVER.assets.usages.detach(
            asset.assetUuid,
            'project',
            projectUuid,
            'showcase-asset',
          );
          if (asset.meta?.previewAssetUuid) {
            await THEI_SERVER.assets.usages.detach(
              asset.meta.previewAssetUuid,
              'project',
              projectUuid,
              'showcase-preview',
            );
          }
        }
      }

      // Attach new showcase assets (and their previews), update meta for all
      for (let i = 0; i < newShowcase.length; i++) {
        const item = newShowcase[i]!;
        const usageMeta = {
          role: 'showcase-asset' as const,
          order: i,
          caption: item.caption,
          access: item.access,
        };

        if (!currentShowcaseUuids.has(item.assetUuid)) {
          await THEI_SERVER.assets.usages.attach(
            item.assetUuid,
            'project',
            projectUuid,
            'showcase-asset',
          );
          // Also attach the video thumbnail preview if present
          const assetRecord = await THEI_SERVER.assets.findByUuid(
            item.assetUuid,
          );
          if (assetRecord?.meta?.previewAssetUuid) {
            await THEI_SERVER.assets.usages.attach(
              assetRecord.meta.previewAssetUuid,
              'project',
              projectUuid,
              'showcase-preview',
            );
          }
        }

        await THEI_SERVER.assets.usages.update(
          item.assetUuid,
          'project',
          projectUuid,
          'showcase-asset',
          { meta: usageMeta },
        );
      }

      // Reconcile other assets
      const currentOther =
        await THEI_SERVER.assets.usages.findOther(projectUuid);
      const currentOtherUuids = new Set(
        currentOther.map((o) => o.asset.assetUuid),
      );
      const newOther = result.otherAssets ?? [];
      const newOtherUuids = new Set(newOther.map((o) => o.assetUuid));

      // Detach removed other assets (and their video previews)
      for (const { asset } of currentOther) {
        if (!newOtherUuids.has(asset.assetUuid)) {
          await THEI_SERVER.assets.usages.detach(
            asset.assetUuid,
            'project',
            projectUuid,
            'other-asset',
          );
          if (asset.meta?.previewAssetUuid) {
            await THEI_SERVER.assets.usages.detach(
              asset.meta.previewAssetUuid,
              'project',
              projectUuid,
              'showcase-preview',
            );
          }
        }
      }

      // Attach new other assets (and their video previews), update meta for all
      for (let i = 0; i < newOther.length; i++) {
        const item = newOther[i]!;
        const usageMeta = {
          role: 'other-asset' as const,
          order: i,
          title: item.title,
          caption: item.caption,
          access: item.access,
        };

        if (!currentOtherUuids.has(item.assetUuid)) {
          await THEI_SERVER.assets.usages.attach(
            item.assetUuid,
            'project',
            projectUuid,
            'other-asset',
          );
          const assetRecord = await THEI_SERVER.assets.findByUuid(
            item.assetUuid,
          );
          if (assetRecord?.meta?.previewAssetUuid) {
            await THEI_SERVER.assets.usages.attach(
              assetRecord.meta.previewAssetUuid,
              'project',
              projectUuid,
              'showcase-preview',
            );
          }
        }

        await THEI_SERVER.assets.usages.update(
          item.assetUuid,
          'project',
          projectUuid,
          'other-asset',
          { meta: usageMeta },
        );
      }

      return { type: 'success', projectUuid } satisfies ProjectSaveResponse;
    }

    case 'DELETE': {
      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      for (const usage of usages) {
        await THEI_SERVER.assets.usages.detach(
          usage.asset.assetUuid,
          'project',
          projectUuid,
          usage.role,
        );
      }
      await THEI_SERVER.projects.delete(projectUuid);
      return;
    }
  }
});
