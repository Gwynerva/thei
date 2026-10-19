import {
  AssetType,
  type ArchivedOriginalFileMeta,
  type AssetRole,
} from '#layers/thei/shared/asset';
import {
  getAssetMediaKind,
  normalizeAssetExtension,
  type AssetMediaKind,
} from '#layers/thei/shared/assets/formats';
import { assetPreview } from '#layers/thei/shared/assets/preview';
import type {
  AssetSource,
  AssetSourceType,
  AssetPlacement,
} from '#layers/thei/shared/asset-library';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { IconName } from '#thei/icons';

export const assetSourceIcon = {
  project: entityTypeIcon('project'),
  'project-section': entityTypeIcon('project-section'),
  event: entityTypeIcon('event'),
  page: entityTypeIcon('page'),
  'diary-entry': entityTypeIcon('diary-entry'),
  tag: entityTypeIcon('tag'),
  profile: 'person',
  'ai-session': 'ai-chat',
  unused: 'delete',
} as const satisfies Record<AssetSourceType, string>;
export function assetSourceLabel(source: Pick<AssetSource, 'type'>) {
  return {
    project: phrase.value.project,
    'project-section': phrase.value.content_section,
    event: phrase.value.event,
    page: phrase.value.page,
    'diary-entry': phrase.value.diary_entry,
    tag: phrase.value.tag,
    profile: phrase.value.asset_source_profile,
    'ai-session': phrase.value.asset_source_ai_session,
    unused: phrase.value.asset_library_unused,
  }[source.type];
}
/**
 * What holds a file, named as the owner knows it: a diary entry, which has
 * no title, by its day written out; anything else by its title, formatted.
 */
export function assetSourceTitle(source: Pick<AssetSource, 'type' | 'title'>) {
  if (source.type === 'unused') return phrase.value.asset_library_unused;
  // A session not named yet is a new one, as its list calls it.
  if (source.type === 'ai-session')
    return publicText(source.title) || phrase.value.ai_session_untitled;
  return source.type === 'diary-entry'
    ? entityDisplayTitle({ title: source.title, date: source.title })
    : publicText(source.title);
}
/**
 * Describes a stored file for tooltips and screen readers.
 *
 * Only what the site knows about the bytes: the uploaded file's name is never
 * kept.
 */
export function assetFileLabel(asset: {
  type: AssetType;
  extension: string;
  size: number;
}) {
  return `${assetKindLabel(asset.type)} · ${asset.extension.toUpperCase()} · ${useHumanSize()(asset.size)}`;
}

/** What kind of file it is, in a word: the name of a file's window. */
export function assetKindLabel(type: AssetType) {
  return {
    [AssetType.Image]: phrase.value.image,
    [AssetType.Video]: phrase.value.video,
    [AssetType.Audio]: phrase.value.audio,
    [AssetType.Other]: phrase.value.asset,
  }[type];
}

/** The icon a file's window is named with, by the kind of file. */
export const assetKindIcon = {
  [AssetType.Image]: 'media',
  [AssetType.Video]: 'media',
  [AssetType.Audio]: 'audio',
  [AssetType.Other]: 'file',
} as const satisfies Record<AssetType, IconName>;

const ASSET_TYPE_OF_KIND = {
  image: AssetType.Image,
  video: AssetType.Video,
  audio: AssetType.Audio,
  other: AssetType.Other,
} as const satisfies Record<AssetMediaKind, AssetType>;

/** The kind of a file, as its extension says. */
export function assetTypeOfExtension(extension: string): AssetType {
  return ASSET_TYPE_OF_KIND[getAssetMediaKind(extension)];
}

/**
 * What a file is, for a reader who has no title to go by: a picture, a video
 * or a recording by its kind; any other file by the format a person knows it
 * as — a PDF document, a ZIP archive — and failing that, by its extension. A
 * file kept zipped is named by its original, as it is shown.
 */
export function assetFormatLabel(
  extension: string,
  archivedOriginal?: ArchivedOriginalFileMeta,
): string {
  const type = assetTypeOfExtension(extension);
  if (type !== AssetType.Other) return assetKindLabel(type);
  const kind = assetPreview(extension, archivedOriginal)?.kind;
  return phrase.value.asset_format(
    !kind || kind === 'probe' ? 'other' : kind,
    normalizeAssetExtension(archivedOriginal?.extension ?? extension),
  );
}

export function assetDeletionLabel(deleteAfter: number) {
  return phrase.value.asset_library_pending_deletion(
    new Date(deleteAfter).toLocaleString(language.value.code, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  );
}

export function assetRoleLabel(
  role: AssetRole,
  detail?: AssetPlacement['detail'],
) {
  if (detail === 'avatar') return phrase.value.asset_role_avatar;
  if (detail === 'status') return phrase.value.asset_role_status;
  return {
    favicon: phrase.value.asset_role_favicon,
    icon: phrase.value.asset_role_icon,
    banner: phrase.value.asset_role_banner,
    content: phrase.value.asset_role_content,
    'showcase-asset': phrase.value.asset_role_showcase,
    'other-asset': phrase.value.asset_role_other,
    preview: phrase.value.asset_role_preview,
    'action-icon': phrase.value.asset_role_action_icon,
    'action-background': phrase.value.asset_role_action_background,
    'action-file': phrase.value.asset_role_action_file,
    'ai-attachment': phrase.value.asset_role_ai_attachment,
  }[role];
}

export function assetPlacementLabel(placement: AssetPlacement) {
  return assetUseLabel(placement.role, placement.source.type, placement.detail);
}

/**
 * How a file is used in a place, in a word or two: a text names whose it
 * is. The admin's window and a visitor's say it alike.
 */
export function assetUseLabel(
  role: AssetRole,
  sourceType: AssetSourceType,
  detail?: AssetPlacement['detail'],
) {
  if (role !== 'content') return assetRoleLabel(role, detail);
  return {
    content: phrase.value.asset_role_content,
    'project-description': phrase.value.asset_role_project_description,
    'event-description': phrase.value.asset_role_event_description,
    'page-content': phrase.value.asset_role_page_content,
    'profile-about': phrase.value.asset_role_profile_about,
  }[assetContentContext(sourceType)];
}

export function assetPlacementContentContext(
  placement: AssetPlacement,
):
  | 'content'
  | 'project-description'
  | 'event-description'
  | 'page-content'
  | 'profile-about' {
  if (placement.role !== 'content') return 'content';
  return assetContentContext(placement.source.type);
}

function assetContentContext(sourceType: AssetSourceType) {
  return (
    {
      project: 'project-description',
      'project-section': 'content',
      event: 'event-description',
      page: 'page-content',
      'diary-entry': 'content',
      profile: 'profile-about',
      tag: 'content',
      'ai-session': 'content',
      unused: 'content',
    } as const
  )[sourceType];
}
