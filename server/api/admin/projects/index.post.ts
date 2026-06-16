import {
  validateProjectData,
  type ProjectEditData,
} from '#layers/thei/shared/admin/project';
import { and, eq } from 'drizzle-orm';
import type { ProjectSaveResponse } from '#layers/thei/shared/api/project';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';
import { validateProjectAssets } from '../../../thei/projects/validate-assets';

export default defineEventHandler(
  async (event): Promise<ProjectSaveResponse> => {
    const body = await readBody<ProjectEditData>(event);
    const result = validateProjectData(body);
    if (typeof result === 'string') return { type: 'error', message: result };

    const existing = await THEI_SERVER.projects.findBySlug(result.slug);
    if (existing) return { type: 'error', message: 'Slug is already taken' };

    const assetError = await validateProjectAssets(result);
    if (assetError) return { type: 'error', message: assetError };

    const projectUuid = await generateUniqueId(
      EntityPrefix.Project,
      async (id) => !(await THEI_SERVER.projects.findByUuid(id)),
    );

    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      tx.insert(schema.projects)
        .values({
          projectUuid,
          title: result.title,
          summary: result.summary,
          slug: result.slug,
          access: result.access,
          important: result.important,
          cv: result.cv,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      if (result.iconAssetUuid) {
        attachUsage(tx, schema, result.iconAssetUuid, projectUuid, 'icon');
      }

      if (result.bannerAssetUuid) {
        attachUsage(tx, schema, result.bannerAssetUuid, projectUuid, 'banner');
      }

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

    return { type: 'success', projectUuid };
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
