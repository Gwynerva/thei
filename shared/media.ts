import type { ImageAccent } from '#layers/thei/shared/accent-color';
export type MediaKind = 'image' | 'video';
export type MediaPlayback = 'manual' | 'autoplay' | 'interaction';

export interface MediaSurfaceProps {
  src: string;
  kind?: MediaKind;
  previewSrc?: string;
  accent?: ImageAccent;
  width?: number;
  height?: number;
  playback?: MediaPlayback;
  autoplayReducedMotion?: boolean;
  engaged?: boolean;
  suspended?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  backdrop?: boolean;
  alt?: string;
  /** Descriptor data only: whether a video has an audio track. */
  hasAudio?: boolean;
}

export interface MediaDescriptor {
  src: string;
  kind: MediaKind;
  previewSrc: string;
  accent?: ImageAccent;
  width?: number;
  height?: number;
  /** Known for stored videos: whether an audio track exists. */
  hasAudio?: boolean;
  /**
   * The engine drew this icon from the entity's own name because none was
   * uploaded. It is shown on a tinted tile, the way a missing icon always was;
   * an icon someone chose is shown on its own.
   */
  generated?: true;
}
