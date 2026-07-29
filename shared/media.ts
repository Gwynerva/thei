export type MediaKind = 'image' | 'video';

export interface MediaDescriptor {
  src: string;
  kind: MediaKind;
  previewSrc: string;
  accentHue?: number;
  width?: number;
  height?: number;
}
