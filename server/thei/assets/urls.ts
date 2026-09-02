import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import type { AssetRole } from '#layers/thei/shared/asset';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildStoredMediaDescriptor, type StoredAssetRecord } from './storage';

type StoredAsset = Parameters<typeof buildStoredMediaDescriptor>[0];

export async function buildPublicProjectMedia(
  project: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  role: AssetRole,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}media/${role}/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildPublicEventContentMedia(
  event: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildEventUrl(event.humanReadableSlug, event.publicId)}content/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildPublicEventMedia(
  event: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  role: AssetRole,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildEventUrl(event.humanReadableSlug, event.publicId)}${role}/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildPublicProjectContentMedia(
  project: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}content/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildPublicTagMedia(
  tag: { slug: string; publicId: string },
  asset: StoredAssetRecord,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildTagUrl(tag.slug, tag.publicId)}icon/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildPublicPageMedia(
  page: { slug: string },
  asset: StoredAssetRecord,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildPageUrl(page.slug)}icon/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildPublicPageContentMedia(
  page: { slug: string },
  asset: StoredAssetRecord,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildPageUrl(page.slug)}content/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: `${src}?preview=1` };
}

export async function buildAdminAssetUrls(asset: StoredAsset) {
  const assetUrl = buildAssetPreviewUrl(asset.assetUuid);

  if (asset.type === AssetType.Video || asset.type === AssetType.Image) {
    return {
      assetUrl,
      media: await buildStoredMediaDescriptor(asset),
    };
  }

  return {
    assetUrl,
    media: undefined,
  };
}

export function archivedOriginalFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'archivedOriginal' in meta ? meta.archivedOriginal : undefined;
}
