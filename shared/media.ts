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
  engaged?: boolean;
  suspended?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  backdrop?: boolean;
  alt?: string;
}

export interface MediaDescriptor {
  src: string;
  kind: MediaKind;
  previewSrc: string;
  accent?: ImageAccent;
  width?: number;
  height?: number;
}
