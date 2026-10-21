import type { ImageAccent } from '#layers/thei/shared/accent-color';
import type { MediaDescriptor } from '#layers/thei/shared/media';

type VideoStill = {
  previewSrc?: string;
  accent?: ImageAccent;
  /** The stills this tab had shown for the video before this one was taken. */
  replaced: ReadonlySet<string | undefined>;
};

/**
 * Stills chosen in this tab, by the address of their video. A place keeps a
 * video's descriptor as it read it; once the owner takes another frame in a
 * file window, every place that draws the video — the window, the library's
 * tiles, a text's blocks, the form behind the window — shows the new still
 * at once, without reading anything again or changing what it holds. A page
 * loaded afresh reads the new still from the server.
 *
 * Only a descriptor read before the choice is covered: one whose still this
 * tab had shown then. A place that reads the video again — after a frame
 * taken in another tab, say — shows what it read.
 *
 * Written only in the browser, by the owner's own click, so a server never
 * holds one for a request.
 */
const stills = shallowReactive(new Map<string, VideoStill>());
/** The stills shown for each video in this tab, as places drew them. */
const shown = new Map<string, Set<string | undefined>>();

/** Notes the still a place draws for a video, as it read it. */
export function noteVideoStill(src: string, previewSrc: string | undefined) {
  if (!import.meta.client) return;
  const seen = shown.get(src) ?? new Set();
  seen.add(previewSrc);
  shown.set(src, seen);
}

/** Takes a video's new still, as the server described it after the change. */
export function rememberVideoStill(media: MediaDescriptor | undefined) {
  if (!import.meta.client || media?.kind !== 'video') return;
  const replaced = new Set(shown.get(media.src));
  replaced.delete(media.previewSrc);
  stills.set(media.src, {
    previewSrc: media.previewSrc,
    accent: media.accent,
    replaced,
  });
}

/**
 * The still chosen for the video at `src` since its place read it, if any:
 * when the place's own still is one this tab showed before the choice.
 */
export function chosenVideoStill(
  src: string,
  previewSrc: string | undefined,
): VideoStill | undefined {
  const still = stills.get(src);
  return still?.replaced.has(previewSrc) ? still : undefined;
}
