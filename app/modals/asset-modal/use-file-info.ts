import {
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions.js';

export interface FileInfoDimensions {
  width: number;
  height: number;
}

export function useFileInfo(objectUrl: string, extension: string) {
  const dimensions = ref<FileInfoDimensions | undefined>(undefined);

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
            const svg = doc.documentElement;
            const w = svg.getAttribute('width');
            const h = svg.getAttribute('height');
            if (w !== null && h !== null) {
              const width = parseFloat(w);
              const height = parseFloat(h);
              if (!isNaN(width) && !isNaN(height)) {
                dimensions.value = { width, height };
              }
            }
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

  return { dimensions };
}
