import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { AssetType } from '#layers/thei/shared/asset';
import type { ContentSlot } from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { stringColorHue } from '#layers/thei/shared/utils/string-color';
import { assetFilePath } from '../../assets/file-path';
import {
  isGeneratedIconKind,
  resolveEntityIconMedia,
} from '../../media/generated-icon';
import { publicContentMediaAssets } from '../../public/content';
import { getProfile } from '../../profile';
import { ownerText } from '../../owner-text';
import type { OgPicture, OgSite, OgStat } from '../model';

/**
 * What every card's content needs to know, whatever it is about.
 */
const GENERATED_ICON_PATTERN =
  /^\/media\/generated-icons\/([a-z-]+)\/([a-f0-9]{64})\./;

type StoredAsset = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.assets.findByUuid>>
>;

/**
 * A stored asset as a picture the card can draw. A video stands in by the
 * still frame the page shows before it plays; a video without one, audio and
 * other files have no picture at all.
 */
export async function ogPictureOfAsset(
  asset: StoredAsset | undefined,
  size: { width?: number; height?: number; accent?: ImageAccent } = {},
): Promise<OgPicture | undefined> {
  if (!asset) return undefined;
  let file = asset;
  if (asset.type === AssetType.Video) {
    const preview = (
      await THEI_SERVER.assets.usages.findByContainer('asset', asset.assetUuid)
    ).find((usage) => usage.role === 'preview')?.asset;
    if (!preview) return undefined;
    file = preview;
  } else if (asset.type !== AssetType.Image) return undefined;
  const meta = asset.meta;
  const accent =
    size.accent ?? (meta && 'accent' in meta ? meta.accent : undefined);
  return {
    type: 'file',
    key: `${file.contentHash}.${file.extension}`,
    file: assetFilePath(file.contentHash, file.extension),
    ...(size.width && size.height
      ? { width: size.width, height: size.height }
      : {}),
    ...(accent ? { accent } : {}),
  };
}

/**
 * The picture behind what a page shows: its drawn icon when the engine drew
 * one, otherwise the stored file its public address ends in. Starting from
 * the page's own descriptor means a card never shows a picture the page
 * would not.
 */
export async function ogPictureOfMedia(
  media: MediaDescriptor | undefined,
): Promise<OgPicture | undefined> {
  if (!media?.src) return undefined;
  const generated = GENERATED_ICON_PATTERN.exec(media.src);
  if (generated) {
    const [, kind, key] = generated;
    if (!isGeneratedIconKind(kind)) return undefined;
    return {
      type: 'generated',
      kind,
      hue: media.accent?.hue ?? stringColorHue(key!),
    };
  }
  const name = media.src.split('?')[0]!.split('/').pop() ?? '';
  const slug = name.slice(0, name.lastIndexOf('.'));
  if (!slug) return undefined;
  return ogPictureOfAsset(
    (await THEI_SERVER.assets.findBySlug(slug)) ?? undefined,
    media,
  );
}

/**
 * The picture of a section, an event or a diary entry: the first
 * picture of its public body a card can draw — a video by its still, passed
 * over while it has none — else the drawn icon its page shows for a thing
 * without one.
 */
export async function ogBodyPicture(
  ownerType: 'event' | 'project-section' | 'diary-entry',
  ownerId: string,
  slot: ContentSlot,
): Promise<OgPicture | undefined> {
  for await (const asset of publicContentMediaAssets(
    ownerType,
    ownerId,
    slot,
  )) {
    const picture = await ogPictureOfAsset(asset);
    if (picture) return picture;
  }
  return ogPictureOfMedia(resolveEntityIconMedia(ownerType, ownerId));
}

/** The accent a picture carries, or one from the thing's identity. */
export function ogAccent(
  accent: ImageAccent | undefined,
  seed: string,
): ImageAccent {
  return accent ?? { hue: stringColorHue(seed), chroma: 0.15 };
}

/**
 * The site as its cards sign it: the owner's name, the address the site is
 * configured with — never the one a request came by, since the picture is
 * drawn once for everyone — and the favicon the owner uploaded, if any.
 */
export async function ogSite(displayName: string): Promise<OgSite> {
  const siteUrl = THEI_SERVER.config.siteUrl;
  let domain: string | undefined;
  if (siteUrl) {
    const url = new URL(siteUrl);
    domain = `${url.host}${url.pathname.replace(/\/+$/, '')}`;
  }
  let faviconUuid: string | null = null;
  try {
    faviconUuid = getProfile().faviconAssetUuid;
  } catch {}
  const favicon = faviconUuid
    ? await ogPictureOfAsset(
        (await THEI_SERVER.assets.findByUuid(faviconUuid)) ?? undefined,
      )
    : undefined;
  return {
    name: ownerText(displayName),
    ...(domain ? { domain } : {}),
    ...(favicon ? { favicon } : {}),
  };
}

/** A number as the site's language groups it: "1 204", "1,204". */
export function ogNumber(count: number): string {
  return new Intl.NumberFormat(THEI_SERVER.language.code).format(count);
}

/**
 * A counted phrase with its number grouped: the language's plural rules
 * write "1204 записи", a card shows "1 204 записи".
 */
export function ogCount(text: string, count: number): string {
  const raw = String(count);
  return text.startsWith(raw)
    ? `${ogNumber(count)}${text.slice(raw.length)}`
    : text;
}

/** A counted phrase split for a stat: the figure large, the word beside it. */
export function ogStat(icon: string, text: string, count: number): OgStat {
  const raw = String(count);
  return text.startsWith(raw)
    ? { icon, value: ogNumber(count), label: text.slice(raw.length).trim() }
    : { icon, value: ogNumber(count), label: text };
}
