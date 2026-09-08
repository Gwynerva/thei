import type { PropType } from 'vue';
import type { ImageAccent } from '#layers/thei/shared/accent-color';
import type { MediaKind, MediaPlayback } from '#layers/thei/shared/media';

/** Shared runtime contract for both media presentations. */
export const mediaSurfaceProps = {
  src: { type: String, required: true },
  kind: { type: String as PropType<MediaKind>, default: 'image' },
  previewSrc: String,
  accent: Object as PropType<ImageAccent>,
  width: Number,
  height: Number,
  playback: String as PropType<MediaPlayback>,
  engaged: Boolean,
  suspended: Boolean,
  muted: Boolean,
  loop: Boolean,
  controls: Boolean,
  backdrop: Boolean,
  alt: { type: String, default: '' },
} as const;
