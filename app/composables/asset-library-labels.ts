import { AssetType, type AssetRole } from '#layers/thei/shared/asset';
import type {
  AssetSource,
  AssetSourceType,
  AssetPlacement,
} from '#layers/thei/shared/asset-library';

export const assetSourceIcon = {
  project: 'project',
  event: 'event',
  page: 'page',
  tag: 'tag',
  profile: 'person',
  unused: 'delete',
} as const satisfies Record<AssetSourceType, string>;
export function assetSourceLabel(source: AssetSource) {
  return {
    project: phrase.value.project,
    event: phrase.value.event,
    page: phrase.value.page,
    tag: phrase.value.tag,
    profile: phrase.value.asset_source_profile,
    unused: phrase.value.asset_library_unused,
  }[source.type];
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
  const type = {
    [AssetType.Image]: phrase.value.image,
    [AssetType.Video]: phrase.value.video,
    [AssetType.Audio]: phrase.value.audio,
    [AssetType.Other]: phrase.value.asset,
  }[asset.type];
  return `${type} · ${asset.extension.toUpperCase()} · ${useHumanSize()(asset.size)}`;
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
  }[role];
}

export function assetPlacementLabel(placement: AssetPlacement) {
  if (placement.role !== 'content') {
    return assetRoleLabel(placement.role, placement.detail);
  }
  return {
    content: phrase.value.asset_role_content,
    'project-description': phrase.value.asset_role_project_description,
    'event-description': phrase.value.asset_role_event_description,
    'page-content': phrase.value.asset_role_page_content,
    'profile-about': phrase.value.asset_role_profile_about,
  }[assetPlacementContentContext(placement)];
}

export function assetPlacementContentContext(
  placement: AssetPlacement,
):
  | 'content'
  | 'project-description'
  | 'event-description'
  | 'page-content'
  | 'profile-about' {
  if (placement.role !== 'content' || placement.scope.kind !== 'entity') {
    return 'content';
  }
  return (
    {
      project: 'project-description',
      event: 'event-description',
      page: 'page-content',
      profile: 'profile-about',
      tag: 'content',
      unused: 'content',
    } as const
  )[placement.source.type];
}

export function assetPlacementScopeLabel(placement: AssetPlacement) {
  return placement.scope.kind === 'project-stage'
    ? phrase.value.asset_scope_stage
    : placement.scope.kind === 'project-section'
      ? phrase.value.asset_scope_section
      : undefined;
}
