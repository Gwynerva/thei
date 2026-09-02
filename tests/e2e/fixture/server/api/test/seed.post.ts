import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  prepareContentForSave,
  applyPreparedContentSave,
} from '#layers/thei/server/thei/content/repository';
import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import {
  storeAsset,
  createMediaPreviewAsset,
  attachMediaPreviewUsage,
} from '#layers/thei/server/thei/assets/storage';

export default defineEventHandler(async (event) => {
  if (!(await THEI_SERVER.isAdmin(event)))
    throw createError({ statusCode: 403 });
  const { db, schema } = THEI_SERVER.useDb();
  // This route only exists in the isolated fixture. Keep repeated runs deterministic.
  db.transaction((tx) => {
    for (const table of [
      schema.content,
      schema.assetUsages,
      schema.pages,
      schema.projectStages,
      schema.projectContentSections,
      schema.stagePeriods,
      schema.projects,
      schema.events,
      schema.tagUsages,
      schema.tags,
    ])
      tx.delete(table).run();
    for (let index = 0; index < 2000; index++) {
      const day = index < 500 ? 0 : Math.floor((index - 500) / 6) + 1;
      const date = Date.UTC(2026, 8, 2 - day);
      tx.insert(schema.pages)
        .values({
          pageUuid: `page-${index}`,
          slug: `page-${index}`,
          title: `Fixture page ${index}`,
          summary: 'A regression card with content and links.',
          access: ProjectEventAccessLevel.Public,
          createdAt: date,
          updatedAt: date,
        })
        .run();
    }
  });
  const media = [];
  for (const height of [120, 280, 440]) {
    const buffer = await sharp({
      create: { width: 320, height, channels: 3, background: '#648baf' },
    })
      .webp()
      .toBuffer();
    const { asset } = await storeAsset({
      buffer,
      extension: 'webp',
      familyUuid: `fixture-image-${height}`,
      settingsKey: 'fixture',
      settingsVersion: 1,
      settings: null,
      type: AssetType.Image,
      meta: { width: 320, height, accentHue: 230 },
    });
    const preview = await createMediaPreviewAsset(buffer, AssetType.Image);
    await attachMediaPreviewUsage(asset.assetUuid, preview.previewAssetUuid);
    media.push(asset);
  }
  db.transaction((tx) => {
    for (let index = 0; index < 2000; index += 5)
      tx.insert(schema.assetUsages)
        .values({
          assetUuid: media[index % media.length]!.assetUuid,
          containerType: 'page',
          containerId: `page-${index}`,
          role: 'icon',
        })
        .run();
  });
  const prepared = await prepareContentForSave('page', 'page-0', 'page-body', {
    data: {
      blocks: [
        {
          id: 'public-heading',
          type: 'header',
          data: { text: 'Public heading', level: 2 },
        },
        {
          id: 'private-heading',
          type: 'header',
          data: { text: 'Private heading', level: 2 },
          tunes: { privateAccess: { isPrivate: true } },
        },
        {
          id: 'start',
          type: 'privateSectionBoundary',
          data: { sectionId: 'section', edge: 'start' },
        },
        {
          id: 'inside',
          type: 'header',
          data: { text: 'Section heading', level: 3 },
        },
        {
          id: 'end',
          type: 'privateSectionBoundary',
          data: { sectionId: 'section', edge: 'end' },
        },
        {
          id: 'text',
          type: 'paragraph',
          data: {
            text: 'A <a href="https://example.com/">reference</a> for keyboard navigation.',
          },
        },
      ],
    },
  });
  db.transaction((tx) =>
    applyPreparedContentSave(
      tx,
      schema,
      'page',
      'page-0',
      'page-body',
      prepared,
    ),
  );
  return { pages: 2000 };
});
