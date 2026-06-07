import {
  validateProjectData,
  type ProjectEditData,
} from '#layers/thei/shared/admin/project';
import type { ProjectSaveResponse } from '#layers/thei/shared/api/project';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';

export default defineEventHandler(
  async (event): Promise<ProjectSaveResponse> => {
    const body = await readBody<ProjectEditData>(event);
    const result = validateProjectData(body);
    if (typeof result === 'string') return { type: 'error', message: result };

    const existing = await THEI_SERVER.projects.findBySlug(result.slug);
    if (existing) return { type: 'error', message: 'Slug is already taken' };

    const projectUuid = await generateUniqueId(
      EntityPrefix.Project,
      async (id) => !(await THEI_SERVER.projects.findByUuid(id)),
    );

    await THEI_SERVER.projects.create({
      projectUuid,
      title: result.title,
      summary: result.summary,
      slug: result.slug,
      access: result.access,
      important: result.important,
      cv: result.cv,
    });

    if (result.iconAssetUuid) {
      await THEI_SERVER.assets.usages.attach(
        result.iconAssetUuid,
        'project',
        projectUuid,
        'icon',
      );
    }

    if (result.bannerAssetUuid) {
      await THEI_SERVER.assets.usages.attach(
        result.bannerAssetUuid,
        'project',
        projectUuid,
        'banner',
      );
    }

    for (let i = 0; i < (result.showcaseAssets ?? []).length; i++) {
      const item = result.showcaseAssets![i]!;
      await THEI_SERVER.assets.usages.attach(
        item.assetUuid,
        'project',
        projectUuid,
        'showcase-asset',
      );
      await THEI_SERVER.assets.usages.update(
        item.assetUuid,
        'project',
        projectUuid,
        'showcase-asset',
        {
          meta: {
            role: 'showcase-asset',
            order: i,
            caption: item.caption,
            access: item.access,
          },
        },
      );
    }

    for (let i = 0; i < (result.otherAssets ?? []).length; i++) {
      const item = result.otherAssets![i]!;
      await THEI_SERVER.assets.usages.attach(
        item.assetUuid,
        'project',
        projectUuid,
        'other-asset',
      );
      await THEI_SERVER.assets.usages.update(
        item.assetUuid,
        'project',
        projectUuid,
        'other-asset',
        {
          meta: {
            role: 'other-asset',
            order: i,
            title: item.title,
            caption: item.caption,
            access: item.access,
          },
        },
      );
    }

    return { type: 'success', projectUuid };
  },
);
