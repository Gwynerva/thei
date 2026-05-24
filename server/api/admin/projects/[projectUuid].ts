import {
  validateProjectData,
  type ProjectEditData,
} from '#layers/thei/shared/admin/project';
import type {
  ProjectGetResponse,
  ProjectSaveResponse,
} from '#layers/thei/shared/api/project';

export default defineEventHandler(async (event) => {
  const projectUuid = getRouterParam(event, 'projectUuid')!;
  const project = await THEI_SERVER.projects.findByUuid(projectUuid);

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  switch (event.method) {
    case 'GET': {
      const usages = await THEI_SERVER.assets.usages.findByContainer(
        'project',
        projectUuid,
      );
      const iconUsage = usages.find((u) => u.role === 'icon');

      return {
        title: project.title,
        summary: project.summary,
        slug: project.slug,
        access: project.access,
        important: project.important,
        cv: project.cv,
        iconAssetUuid: iconUsage?.asset.assetUuid,
        iconPreviewUrl: iconUsage
          ? `/api/admin/assets/preview/${iconUsage.asset.slug}.${iconUsage.asset.extension}/`
          : undefined,
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
