import { createHash } from 'node:crypto';
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '#layers/thei/shared/access-level';
import { AssetType } from '#layers/thei/shared/asset';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { stringColorHue } from '#layers/thei/shared/utils/string-color';
import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { oklchToHex } from '#layers/thei/shared/accent-color';
import { assetFilePath } from '../assets/file-path';
import type { StoredAssetRecord } from '../assets/storage';
import { getProfileIdentity } from '../profile';
import { canOpenPublicEntity } from '../public/entities';
import { buildPublicEntityPreviewMedia } from '../public/content';
import { resolveGeneratedIcon } from '../media/generated-icon';
import { resolveFaviconSet } from '../media/favicon';
import { glyphDataUri, mediaDataUri, resolveMediaFile } from './media';
import type { OgCard } from './templates';

/**
 * What a shared link is a picture of.
 *
 * Only what a stranger can open gets a card. A private project has none: the
 * card would preview something the visitor is about to be refused, and its
 * title alone would say more than the 404 does. The admin panel has none
 * either — it is not a place anyone shares a link to.
 */
export type OgTargetKind =
  | 'site'
  | 'service'
  | 'project'
  | 'stage'
  | 'section'
  | 'event'
  | 'page'
  | 'diary'
  | 'tag';

export const OG_TARGET_KINDS: OgTargetKind[] = [
  'site',
  'service',
  'project',
  'stage',
  'section',
  'event',
  'page',
  'diary',
  'tag',
];

export interface OgTarget {
  kind: OgTargetKind;
  /** Public id, slug or service name; empty for the site card. */
  id: string;
}

/** The service pages worth a card, each with the icon it is known by. */
const SERVICE_PAGES: Record<string, { icon: string; title: () => string }> = {
  life: { icon: 'heart', title: () => THEI_SERVER.phrase.life },
  rewind: {
    icon: 'history',
    title: () => THEI_SERVER.phrase.life_rewind_seo_title,
  },
  search: { icon: 'search', title: () => THEI_SERVER.phrase.search },
  projects: { icon: 'project', title: () => THEI_SERVER.phrase.projects },
  events: { icon: 'event', title: () => THEI_SERVER.phrase.events },
  pages: { icon: 'page', title: () => THEI_SERVER.phrase.pages },
  tags: { icon: 'tag', title: () => THEI_SERVER.phrase.tags },
};

export interface ResolvedOgCard {
  card: OgCard;
  /** Everything the drawing depends on, so an unchanged card is not redrawn. */
  signature: string;
}

export async function resolveOgCard(
  target: OgTarget,
): Promise<ResolvedOgCard | undefined> {
  // A closed site publishes nothing, so there is nothing to preview.
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private)
    return undefined;

  const identity = await getProfileIdentity();
  const faviconSet = await resolveFaviconSet();
  const siteName = identity.profile.displayName;
  const base = {
    siteName,
    faviconDataUri: await mediaDataUri(faviconSet.source.filePath, {
      width: 96,
      height: 96,
      fit: 'contain',
    }),
  };
  const siteSignature = `${siteName}:${faviconSet.version}`;

  switch (target.kind) {
    case 'site': {
      const accent = accentOf(identity.avatarMedia?.accent, siteName);
      return {
        card: {
          kind: 'home',
          ...base,
          ...accent,
          title: siteName,
          slogan: identity.profile.slogan || undefined,
          avatarDataUri: await mediaDataUri(
            await resolveMediaFile(identity.avatarMedia),
            { width: 600, height: 600 },
          ),
        },
        signature: [
          'site',
          siteSignature,
          identity.profile.slogan,
          identity.avatarMedia?.src,
        ].join('|'),
      };
    }
    case 'service': {
      const page = SERVICE_PAGES[target.id];
      if (!page) return undefined;
      const accent = accentOf(undefined, target.id);
      return {
        card: {
          kind: 'service',
          ...base,
          ...accent,
          title: page.title(),
          glyphDataUri: await glyphDataUri(
            page.icon,
            oklchToHex(0.85, accent.accentChroma, accent.accentHue),
          ),
        },
        signature: ['service', target.id, siteSignature, page.title()].join(
          '|',
        ),
      };
    }
    case 'project':
      return projectCard(target.id, base, siteSignature);
    case 'stage':
    case 'section':
      return projectChildCard(target.kind, target.id, base, siteSignature);
    case 'event':
      return eventCard(target.id, base, siteSignature);
    case 'page':
      return pageCard(target.id, base, siteSignature);
    case 'diary':
      return diaryCard(target.id, base, siteSignature);
    case 'tag':
      return tagCard(target.id, base, siteSignature);
  }
}

type Base = { siteName: string; faviconDataUri?: string };

/**
 * The file a card can actually draw.
 *
 * A card is a still image, so a video's own bytes are useless here: what the
 * page shows as its first frame is a separate preview asset, and that is what
 * the poster becomes. Without one there is nothing to draw.
 */
async function assetFile(asset: StoredAssetRecord | undefined) {
  if (!asset) return undefined;
  if (asset.type === AssetType.Video) {
    const preview = (
      await THEI_SERVER.assets.usages.findByContainer('asset', asset.assetUuid)
    ).find((usage) => usage.role === 'preview')?.asset;
    return preview
      ? assetFilePath(preview.contentHash, preview.extension)
      : undefined;
  }
  if (asset.type !== AssetType.Image) return undefined;
  return assetFilePath(asset.contentHash, asset.extension);
}

/** The colour an image or video carries; audio and files have none. */
function assetAccent(
  asset: StoredAssetRecord | undefined,
): ImageAccent | undefined {
  const meta = asset?.meta;
  return meta && 'accent' in meta ? meta.accent : undefined;
}

async function containerAsset(
  containerType: 'project' | 'tag',
  containerId: string,
  role: string,
) {
  const usages = await THEI_SERVER.assets.usages.findByContainer(
    containerType,
    containerId,
  );
  return usages.find((usage) => usage.role === role)?.asset;
}

async function projectCard(
  id: string,
  base: Base,
  siteSignature: string,
): Promise<ResolvedOgCard | undefined> {
  const project = await THEI_SERVER.projects.findByPublicId(id);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  // The banner is the project's own wide artwork; the icon is the fallback.
  // A video banner comes last of all: its first frame is whatever the video
  // happens to start on, while the icon is a still someone chose.
  const banner = await containerAsset('project', project.projectUuid, 'banner');
  const icon = await containerAsset('project', project.projectUuid, 'icon');
  const poster = banner?.type === AssetType.Image ? banner : (icon ?? banner);
  // Nothing uploaded: the same drawn icon the site shows for this project.
  const generated = poster
    ? undefined
    : resolveGeneratedIcon('project', project.projectUuid);
  return contentCard({
    base,
    siteSignature,
    title: project.title,
    label: THEI_SERVER.phrase.project,
    media: generated,
    posterFile: poster
      ? await assetFile(poster)
      : await resolveMediaFile(generated),
    posterAccent: assetAccent(poster),
    accentSeed: project.projectUuid,
    signatureId: `project:${project.projectUuid}:${project.updatedAt}`,
  });
}

async function projectChildCard(
  kind: 'stage' | 'section',
  id: string,
  base: Base,
  siteSignature: string,
): Promise<ResolvedOgCard | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  const row =
    kind === 'stage'
      ? db
          .select()
          .from(schema.projectStages)
          .all()
          .find((item) => item.publicId === id)
      : db
          .select()
          .from(schema.projectContentSections)
          .all()
          .find((item) => item.publicId === id);
  if (!row || row.isPrivate) return undefined;
  const project = await THEI_SERVER.projects.findByUuid(row.projectUuid);
  if (!project || !canOpenPublicEntity(project.access, false)) return undefined;
  const icon = await containerAsset('project', project.projectUuid, 'icon');
  // The poster is the stage's own picture, as on its card; the project it
  // belongs to is named, with its icon, in the line above the title.
  const media =
    'stageUuid' in row
      ? await buildPublicEntityPreviewMedia(
          'project-stage',
          row.stageUuid,
          'project-stage-body',
          { type: 'project', ...project },
          false,
        )
      : await buildPublicEntityPreviewMedia(
          'project-section',
          row.sectionUuid,
          'project-section-body',
          { type: 'project', ...project },
          false,
        );
  return contentCard({
    base,
    siteSignature,
    title: row.title,
    label:
      kind === 'stage'
        ? THEI_SERVER.phrase.project_stage
        : THEI_SERVER.phrase.content_section,
    parent: {
      title: project.title,
      iconDataUri: await mediaDataUri(
        icon
          ? await assetFile(icon)
          : await resolveMediaFile(
              resolveGeneratedIcon('project', project.projectUuid),
            ),
        { width: 88, height: 88 },
      ),
    },
    media,
    posterFile: await resolveMediaFile(media),
    accentSeed: 'stageUuid' in row ? row.stageUuid : row.sectionUuid,
    signatureId: `${kind}:${id}:${row.updatedAt}`,
  });
}

async function eventCard(
  id: string,
  base: Base,
  siteSignature: string,
): Promise<ResolvedOgCard | undefined> {
  const stored = await THEI_SERVER.events.findByPublicId(id);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  // An event has no icon of its own: the card borrows the first image or
  // video frame from its body, exactly as its card on the site does, and the
  // same drawn icon when the body opens with none.
  const media = await buildPublicEntityPreviewMedia(
    'event',
    stored.eventUuid,
    'event-body',
    { type: 'event', ...stored },
    false,
  );
  return contentCard({
    base,
    siteSignature,
    title: stored.title,
    label: THEI_SERVER.phrase.event,
    media,
    posterFile: await resolveMediaFile(media),
    accentSeed: stored.eventUuid,
    signatureId: `event:${stored.eventUuid}:${stored.updatedAt}`,
  });
}

/**
 * A diary entry's card.
 *
 * The day is the title, because there is nothing else to call it by. Whatever
 * the entry opens with becomes the poster, and an entry of plain text gets
 * the drawn thought icon the site shows for it — honest about what it is.
 */
async function diaryCard(
  date: string,
  base: Base,
  siteSignature: string,
): Promise<ResolvedOgCard | undefined> {
  const stored = await THEI_SERVER.diary.findByDate(date);
  if (!stored || stored.access === ProjectEventAccessLevel.Private)
    return undefined;
  const media = await buildPublicEntityPreviewMedia(
    'diary-entry',
    stored.diaryUuid,
    'diary-body',
    { type: 'diary-entry', date: stored.date },
    false,
  );
  return contentCard({
    base,
    siteSignature,
    title: formatOgDate(stored.date),
    label: THEI_SERVER.phrase.diary_entry,
    media,
    posterFile: await resolveMediaFile(media),
    accentSeed: stored.diaryUuid,
    signatureId: `diary:${stored.diaryUuid}:${stored.updatedAt}`,
  });
}

/**
 * The day spelled out, in the site's own language.
 *
 * The trailing literal goes: Russian formats a year as "2026 г.", and the
 * abbreviation is noise on a card where the date is the whole headline.
 */
function formatOgDate(date: string): string {
  const parts = new Intl.DateTimeFormat(THEI_SERVER.language.code, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  while (parts.at(-1)?.type === 'literal') parts.pop();
  return parts.map((part) => part.value).join('');
}

async function pageCard(
  slug: string,
  base: Base,
  siteSignature: string,
): Promise<ResolvedOgCard | undefined> {
  const page = await THEI_SERVER.pages.findBySlug(slug);
  if (!page || page.access === ProjectEventAccessLevel.Private)
    return undefined;
  const icon = (
    await THEI_SERVER.assets.usages.findByContainer('page', page.pageUuid)
  ).find((usage) => usage.role === 'icon')?.asset;
  const generated = icon
    ? undefined
    : resolveGeneratedIcon('page', page.pageUuid);
  return contentCard({
    base,
    siteSignature,
    title: page.title,
    label: THEI_SERVER.phrase.page,
    media: generated,
    posterFile: icon
      ? await assetFile(icon)
      : await resolveMediaFile(generated),
    posterAccent: assetAccent(icon),
    accentSeed: page.pageUuid,
    signatureId: `page:${page.pageUuid}:${page.updatedAt}`,
  });
}

async function tagCard(
  id: string,
  base: Base,
  siteSignature: string,
): Promise<ResolvedOgCard | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  const tag = db
    .select()
    .from(schema.tags)
    .all()
    .find((item) => item.publicId === id);
  if (!tag) return undefined;
  const icon = await containerAsset('tag', tag.tagUuid, 'icon');
  return contentCard({
    base,
    siteSignature,
    title: tag.title,
    label: THEI_SERVER.phrase.tag,
    posterFile: await assetFile(icon),
    posterAccent: assetAccent(icon),
    fallbackIcon: 'tag',
    accentSeed: tag.title,
    signatureId: `tag:${tag.tagUuid}:${tag.title}`,
  });
}

async function contentCard(options: {
  base: Base;
  siteSignature: string;
  title: string;
  label: string;
  parent?: { title: string; iconDataUri?: string };
  media?: MediaDescriptor;
  /** The poster's own colour, when the card is drawn from a stored asset. */
  posterAccent?: ImageAccent;
  posterFile?: string;
  /**
   * Drawn when there is no poster at all. Only a tag needs it: every other
   * kind always has a picture, its own or its drawn icon.
   */
  fallbackIcon?: string;
  accentSeed: string;
  signatureId: string;
}): Promise<ResolvedOgCard> {
  const accent = accentOf(
    options.media?.accent ?? options.posterAccent,
    options.accentSeed,
  );
  const poster = await mediaDataUri(options.posterFile, {
    width: 700,
    height: 760,
  });
  return {
    card: {
      kind: 'content',
      ...options.base,
      ...accent,
      title: options.title,
      label: options.label,
      ...(options.parent ? { parent: options.parent } : {}),
      ...(poster
        ? { posterDataUri: poster }
        : {
            glyphDataUri: await glyphDataUri(
              options.fallbackIcon ?? 'thei',
              oklchToHex(0.96, 0.02, accent.accentHue),
            ),
          }),
    },
    signature: [
      options.signatureId,
      options.siteSignature,
      options.title,
      options.label,
      options.parent?.title ?? '',
      options.posterFile ?? options.fallbackIcon ?? '',
      `${accent.accentHue}:${accent.accentChroma}`,
    ].join('|'),
  };
}

/** The entity's own colour where it has one, otherwise one from its identity. */
function accentOf(accent: ImageAccent | undefined, seed: string) {
  return {
    accentHue: accent?.hue ?? stringColorHue(seed),
    accentChroma: accent?.chroma ?? 0.15,
  };
}

export function ogSignatureHash(signature: string): string {
  return createHash('sha256').update(signature).digest('hex').slice(0, 24);
}

/**
 * What choosing a card's contents depends on, as a hash.
 *
 * Kept beside the drawing's own signature: an update that changes which
 * artwork a card borrows is as much a reason to redraw as one that changes
 * how it is laid out.
 */
export function ogCardsSignature(): string {
  return createHash('sha256')
    .update(
      [
        assetFile.toString(),
        projectCard.toString(),
        projectChildCard.toString(),
        eventCard.toString(),
        pageCard.toString(),
        tagCard.toString(),
        contentCard.toString(),
        accentOf.toString(),
      ].join('|'),
    )
    .digest('hex');
}
