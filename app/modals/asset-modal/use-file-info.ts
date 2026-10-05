import {
  audioExtensionProfile,
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
  /** Seconds of a video or a recording, once the browser has read its header. */
  const duration = ref<number | undefined>(undefined);

  if (import.meta.client) {
    const isImage = isExtensionAllowed(extension, imageExtensionProfile);
    const isVideo = isExtensionAllowed(extension, videoExtensionProfile);
    const isAudio = isExtensionAllowed(extension, audioExtensionProfile);

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
    } else if (isVideo || isAudio) {
      // A format this browser cannot play has no length here; the server's
      // reading of the draft stands in once it is staged.
      const media = document.createElement(isVideo ? 'video' : 'audio');
      media.muted = true;
      media.preload = 'metadata';
      const onMeta = () => {
        if (media instanceof HTMLVideoElement) {
          dimensions.value = {
            width: media.videoWidth,
            height: media.videoHeight,
          };
        }
        if (Number.isFinite(media.duration) && media.duration > 0) {
          duration.value = media.duration;
        }
      };
      media.addEventListener('loadedmetadata', onMeta, { once: true });
      media.src = objectUrl;
      cleanup = () => {
        media.removeEventListener('loadedmetadata', onMeta);
        // An element keeps what it loaded until it is told to load nothing.
        media.removeAttribute('src');
        media.load();
      };
    }

    onUnmounted(() => {
      cleanup?.();
    });
  }

  return { dimensions, duration };
}
