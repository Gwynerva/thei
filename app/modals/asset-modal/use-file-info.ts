import {
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions.js';

export interface FileInfoDimensions {
  width: number;
  height: number;
}

/**
 * The size an SVG declares, as librsvg will read it: its `width` and
 * `height` when they are plain lengths, otherwise its `viewBox` — scaled to
 * the one length given, if any. A drawing sized in percent or with neither
 * has no size of its own until the server reads it.
 */
function svgDimensions(svg: Element): FileInfoDimensions | undefined {
  const length = (value: string | null) => {
    const match = value && /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(value);
    return match ? Number(match[1]) : undefined;
  };
  const width = length(svg.getAttribute('width'));
  const height = length(svg.getAttribute('height'));
  if (width && height) return { width, height };
  const box = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box?.length !== 4 || !(box[2]! > 0) || !(box[3]! > 0)) return undefined;
  const [, , boxWidth, boxHeight] = box as [number, number, number, number];
  if (width) return { width, height: (width * boxHeight) / boxWidth };
  if (height) return { width: (height * boxWidth) / boxHeight, height };
  return { width: boxWidth, height: boxHeight };
}

export function useFileInfo(objectUrl: string, extension: string) {
  const dimensions = ref<FileInfoDimensions | undefined>(undefined);
  /** Seconds of a video, once the browser has read its header. */
  const duration = ref<number | undefined>(undefined);

  if (import.meta.client) {
    const isImage = isExtensionAllowed(extension, imageExtensionProfile);
    const isVideo = isExtensionAllowed(extension, videoExtensionProfile);

    let cleanup: (() => void) | undefined;

    if (isImage) {
      if (extension === 'svg') {
        fetch(objectUrl)
          .then((r) => r.text())
          .then((text) => {
            const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
            dimensions.value = svgDimensions(doc.documentElement);
          })
          .catch(() => {});
      } else {
        const img = new Image();
        const onLoad = () => {
          dimensions.value = {
            width: img.naturalWidth,
            height: img.naturalHeight,
          };
        };
        img.addEventListener('load', onLoad, { once: true });
        img.src = objectUrl;
        cleanup = () => {
          img.removeEventListener('load', onLoad);
          img.src = '';
        };
      }
    } else if (isVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      const onMeta = () => {
        dimensions.value = {
          width: video.videoWidth,
          height: video.videoHeight,
        };
        if (Number.isFinite(video.duration) && video.duration > 0) {
          duration.value = video.duration;
        }
      };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
      video.src = objectUrl;
      cleanup = () => {
        video.removeEventListener('loadedmetadata', onMeta);
        video.src = '';
      };
    }

    onUnmounted(() => {
      cleanup?.();
    });
  }

  return { dimensions, duration };
}
