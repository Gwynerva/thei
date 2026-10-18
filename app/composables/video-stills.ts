import type { ImageAccent } from '#layers/thei/shared/accent-color';
import type { MediaDescriptor } from '#layers/thei/shared/media';

type VideoStill = { previewSrc?: string; accent?: ImageAccent };

/**
 * Stills chosen in this tab, by the address of their video. A place keeps a
 * video's descriptor as it read it; once the owner takes another frame in a
 * file window, every place that draws the video — the window, the library's
 * tiles, a text's blocks, the form behind the window — shows the new still
 * at once, without reading anything again or changing what it holds. A page
 * loaded afresh reads the new still from the server.
 *
 * Written only in the browser, by the owner's own click, so a server never
 * holds one for a request.
 */
const stills = shallowReactive(new Map<string, VideoStill>());

/** Takes a video's new still, as the server described it after the change. */
export function rememberVideoStill(media: MediaDescriptor | undefined) {
  if (!import.meta.client || media?.kind !== 'video') return;
  stills.set(media.src, { previewSrc: media.previewSrc, accent: media.accent });
}

/** The still chosen for the video at `src` since its place read it, if any. */
export function chosenVideoStill(src: string): VideoStill | undefined {
  return stills.get(src);
}
