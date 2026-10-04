import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  prepareContentForSave,
  applyPreparedContentSave,
} from '#layers/thei/server/thei/content/repository';
import { upsertExternalLink } from '#layers/thei/server/thei/external-links/repository';
import sharp from 'sharp';
import { ne } from 'drizzle-orm';
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
    // A file's preview belongs to the file, which stays: a file left without
    // one shows itself in its place, as no site ever does, and a spec that
    // reuses its bytes would see that instead of the preview.
    tx.delete(schema.assetUsages)
      .where(ne(schema.assetUsages.containerType, 'asset'))
      .run();
    for (const table of [
      schema.content,
      schema.contentHistory,
      schema.pages,
      schema.projectContentSections,
      schema.periods,
      schema.projects,
      schema.events,
      // A day holds one entry: one left from an earlier run takes the day a
      // spec writes to.
      schema.diaryEntries,
      schema.tagUsages,
      schema.tags,
      schema.backups,
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
      bytes: { buffer },
      extension: 'webp',
      familyUuid: `fixture-image-${height}`,
      settingsKey: 'fixture',
      settings: null,
      type: AssetType.Image,
      meta: { width: 320, height, accent: { hue: 230, chroma: 0.15 } },
    });
    const preview = await createMediaPreviewAsset({ buffer }, AssetType.Image);
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
  // The sites the link specs point at, stored as though they had been read,
  // so that no spec waits on the network. The last one never answered.
  const sites = [
    ['https://noted.example/', 'Noted site', 'complete'],
    ['https://listed.example/', 'Listed site', 'complete'],
    ['https://block.example/', 'Block site', 'complete'],
    ['https://silent.example/', 'silent.example', 'fallback'],
  ] as const;
  for (const [url, title, status] of sites)
    upsertExternalLink({
      url,
      title,
      description:
        status === 'complete' ? `${title}, as it describes itself.` : undefined,
      faviconKey: 'fixture-link',
      status,
      touchedAt: Date.now(),
    });
  // A page links to them, or the sweep would take them for unused a minute
  // later, while the specs before theirs still run.
  const linking = await prepareContentForSave('page', 'page-1', 'page-body', {
    data: {
      blocks: sites.map(([url]) => ({ type: 'externalLink', data: { url } })),
    },
  });
  db.transaction((tx) =>
    applyPreparedContentSave(
      tx,
      schema,
      'page',
      'page-1',
      'page-body',
      linking,
    ),
  );
  const prepared = await prepareContentForSave('page', 'page-0', 'page-body', {
    data: {
      blocks: [
        {
          id: 'public-heading',
          type: 'header',
          data: { text: 'Public heading', level: 2 },
        },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'private-section-1', edge: 'start' },
        },
        {
          id: 'private-heading',
          type: 'header',
          data: { text: 'Private heading', level: 2 },
        },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'private-section-1', edge: 'end' },
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
