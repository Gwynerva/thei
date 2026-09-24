import type { AssetType } from '../asset';
import type { AssetImageTransformSettings } from '../asset-upload-settings';

/**
 * A file the editor works on, staged on the server once.
 *
 * Every attempt at a variant — each dry run, each committed result — is made
 * from this staged copy, so a new file crosses the network one time however
 * long the admin keeps trying settings. Nothing about it is stored in the
 * library until a result is committed.
 */
export interface AssetDraftSource {
  draftId: string;
  type: AssetType;
  extension: string;
  size: number;
  /** Displayed size, EXIF orientation and video rotation applied. */
  width?: number;
  height?: number;
  /** `false` only when a video is known to be silent. */
  hasAudio?: boolean;
  isVector?: boolean;
  /** Of a video: what the editor estimates a variant's size from. */
  duration?: number;
  fps?: number;
  /** Bits per second of the video stream. */
  bitrate?: number;
  codec?: string;
}

/** An image encoded from a draft for the admin to judge, not yet stored. */
export interface AssetDraftRender {
  renderId: string;
  settingsKey: string;
  settings: AssetImageTransformSettings;
  extension: string;
  size: number;
  width: number;
  height: number;
  /** Site path of the encoded bytes; carries no base path. */
  url: string;
}

/** Answer to a request for a draft that the server no longer holds. */
export interface AssetDraftExpired {
  draftExpired: true;
}

export function buildAssetDraftRenderUrl(
  draftId: string,
  renderId: string,
): string {
  return `/api/admin/assets/drafts/${draftId}/renders/${renderId}`;
}
