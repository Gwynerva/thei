import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import type { AssetRole } from '#layers/thei/shared/asset';
import { AssetType } from '#layers/thei/shared/asset';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildStoredMediaDescriptor, type StoredAssetRecord } from './storage';
import { describedText } from './descriptions';

type StoredAsset = Parameters<typeof buildStoredMediaDescriptor>[0];

/**
 * A file as a public page shows it, from its own public address: a picture
 * says what it shows to whoever cannot see it — its file's description, as
 * the owner typed it, formatted where it is drawn. Every builder below takes
 * that description as `alt` when its caller read it already, with those of
 * the other files it shows (`readFamilyDescriptions`, `describeFiles`), and
 * reads it itself otherwise.
 */
function publicMedia(
  media: Awaited<ReturnType<typeof buildStoredMediaDescriptor>>,
  asset: StoredAssetRecord,
  src: string,
  alt = describedText(asset),
) {
  return {
    ...media,
    src,
    previewSrc: `${src}?preview=1`,
    ...(alt ? { alt } : {}),
  };
}

export async function buildPublicProfileMedia(
  asset: StoredAssetRecord,
  container: 'profile' | 'profile-avatar' | 'profile-status',
  id: string,
  role: AssetRole,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `/profile/media/${container}/${id}/${role}/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

/** A project's status icon, served from under the project's own address. */
export async function buildPublicProjectStatusMedia(
  project: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  statusId: string,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}status/${statusId}/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicProjectMedia(
  project: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  role: AssetRole,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}media/${role}/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

/** A section's own file, such as its banner, served from its own address. */
export async function buildPublicProjectSectionMedia(
  project: { humanReadableSlug: string; publicId: string },
  section: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  role: AssetRole,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectSectionUrl(project.humanReadableSlug, project.publicId, section.humanReadableSlug, section.publicId)}media/${role}/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicEventContentMedia(
  event: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildEventUrl(event.humanReadableSlug, event.publicId)}content/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicEventMedia(
  event: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  role: AssetRole,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildEventUrl(event.humanReadableSlug, event.publicId)}${role}/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicDiaryContentMedia(
  entry: { date: string },
  asset: StoredAssetRecord,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildDiaryUrl(entry.date)}content/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicProjectContentMedia(
  project: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}content/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicTagMedia(
  tag: { slug: string; publicId: string },
  asset: StoredAssetRecord,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildTagUrl(tag.slug, tag.publicId)}icon/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicPageMedia(
  page: { slug: string },
  asset: StoredAssetRecord,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildPageUrl(page.slug)}icon/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
}

export async function buildPublicPageContentMedia(
  page: { slug: string },
  asset: StoredAssetRecord,
  alt?: string,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildPageUrl(page.slug)}content/${asset.slug}.${asset.extension}`;
  return publicMedia(media, asset, src, alt);
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
