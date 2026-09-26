import {
  FRAME_SCORE_SAMPLE_SIDE,
  VIDEO_PREVIEW_FRAME_POSITIONS,
  frameScore,
} from '#layers/thei/shared/media-frame-score';

/** The longest side of a poster drawn in the browser. */
const POSTER_MAX_SIDE = 1280;
/** How long one step — the header, one seek — may take before giving up. */
const STEP_TIMEOUT_MS = 8000;

function waitFor(video: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () => finish(new Error('timeout')),
      STEP_TIMEOUT_MS,
    );
    function finish(error?: Error) {
      window.clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    }
    const onEvent = () => finish();
    const onError = () => finish(new Error('video error'));
    video.addEventListener(event, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, seconds: number) {
  if (
    Math.abs(video.currentTime - seconds) < 0.001 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  )
    return;
  const seeked = waitFor(video, 'seeked');
  video.currentTime = seconds;
  await seeked;
}

/**
 * A poster for a video that has no preview yet — a file picked but not
 * uploaded: the browser looks at the same points of it the server will, and
 * draws the frame that shows it best. Without it a `<video>` shows its first
 * frame, which for many videos is black.
 *
 * Returns an object URL the caller revokes, or `undefined` when the browser
 * cannot read the video.
 */
export async function pickVideoPoster(
  src: string,
): Promise<string | undefined> {
  if (!import.meta.client) return undefined;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const loaded = waitFor(video, 'loadeddata');
    video.src = src;
    await loaded;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return undefined;

    const sampleScale = FRAME_SCORE_SAMPLE_SIDE / Math.max(width, height);
    const sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.round(width * sampleScale));
    sample.height = Math.max(1, Math.round(height * sampleScale));
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) return undefined;

    const duration = video.duration;
    const points =
      Number.isFinite(duration) && duration > 1
        ? VIDEO_PREVIEW_FRAME_POSITIONS.map((share) => share * duration)
        : [0];
    let best: { at: number; score: number } | undefined;
    for (const at of points) {
      try {
        await seek(video, at);
      } catch {
        continue;
      }
      sampleContext.drawImage(video, 0, 0, sample.width, sample.height);
      const { data } = sampleContext.getImageData(
        0,
        0,
        sample.width,
        sample.height,
      );
      const score = frameScore(data, 4);
      if (!best || score > best.score) best = { at, score };
    }
    if (!best) return undefined;

    await seek(video, best.at);
    const scale = Math.min(1, POSTER_MAX_SIDE / Math.max(width, height));
    const poster = document.createElement('canvas');
    poster.width = Math.round(width * scale);
    poster.height = Math.round(height * scale);
    poster
      .getContext('2d')
      ?.drawImage(video, 0, 0, poster.width, poster.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      poster.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ? URL.createObjectURL(blob) : undefined;
  } catch {
    return undefined;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * The poster of a picked video, kept while `src` stays the same and let go
 * when it changes or the component goes away. `undefined` until it is ready,
 * and for anything `src` leaves out.
 */
export function useVideoPoster(src: MaybeRefOrGetter<string | undefined>) {
  const poster = shallowRef<string>();
  let generation = 0;

  function release() {
    if (poster.value) URL.revokeObjectURL(poster.value);
    poster.value = undefined;
  }

  watch(
    () => toValue(src),
    async (value) => {
      const current = ++generation;
      release();
      if (!value) return;
      const url = await pickVideoPoster(value);
      if (current !== generation) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      poster.value = url;
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    generation += 1;
    release();
  });

  return poster;
}

/**
 * The still a stored video is shown with: its own preview. A video without
 * one has its own file as `previewSrc`, which is no still at all.
 */
export function videoPosterOf(
  media: { kind: string; src: string; previewSrc?: string } | undefined,
) {
  return media?.kind === 'video' && media.previewSrc !== media.src
    ? media.previewSrc
    : undefined;
}
