/** The shortest time between two drawings of a playing video's backdrop. */
export const FRAME_BACKDROP_INTERVAL = 100;
/** The share of the main thread one backdrop may spend on drawing. */
const DRAW_BUDGET = 0.04;
/** CSS pixels per pixel of the canvas: the blur hides everything finer. */
const SCALE = 4;
/** `--blur-3xl`, if the backdrop does not say how far it is blurred. */
const FALLBACK_BLUR = 64;

type Drawable = [image: CanvasImageSource, width: number, height: number];
interface Layer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D | null;
  fade?: Animation;
}

/**
 * Whether a canvas blurs what it draws itself. A browser without a canvas
 * filter gets the CSS blur on the backdrop instead.
 */
export function canvasFilters() {
  return (
    typeof CanvasRenderingContext2D !== 'undefined' &&
    'filter' in CanvasRenderingContext2D.prototype
  );
}

/**
 * The blurred copy behind a video, drawn from the video's own frames instead
 * of decoded a second time.
 *
 * A second video doubled the decoders, and its blur, as large as the card and
 * past it, was computed again for every frame; a phone with three playing
 * cards on screen could not keep up. A canvas a quarter of the backdrop's size
 * gets the same blur, and stretching an image already blurred costs next to
 * nothing.
 *
 * While the video plays, the copy is drawn again up to ten times a second.
 * Drawn by a GPU, that costs the main thread next to nothing; a canvas the
 * processor draws pays for the whole frame there, so it is drawn less often,
 * as far as keeps it within `DRAW_BUDGET`. However seldom it is drawn, it
 * never jumps: two canvases lie one over the other, and each drawing fades
 * over the last for about as long as the next one takes to come. Only the
 * upper canvas fades, in or out, and only its opacity changes, which the
 * compositor animates by itself; the canvas a drawing goes into is the one
 * out of sight at the time.
 *
 * It shows what the video shows: its poster until it has played, its current
 * frame after that, the very frame it stopped at once it is paused.
 */
export function createFrameBackdrop() {
  let root: HTMLElement | undefined;
  /** The lower canvas, then the upper one, which fades. */
  let layers: Layer[] = [];
  /** The canvas showing the latest drawing. */
  let front = 0;
  let painted = false;
  let video: HTMLVideoElement | undefined;
  let poster: HTMLImageElement | undefined;
  let observer: ResizeObserver | undefined;
  let frameRequest: number | undefined;
  let drawnAt = -Infinity;
  let interval = FRAME_BACKDROP_INTERVAL;
  let cost = 0;
  let blur = 0;

  function decoded(image: HTMLImageElement | undefined): Drawable | undefined {
    return image?.complete && image.naturalWidth
      ? [image, image.naturalWidth, image.naturalHeight]
      : undefined;
  }
  /** What the video element itself shows right now. */
  function source(): Drawable | undefined {
    if (!video) return decoded(poster);
    // A video shows its poster until it first plays or is moved.
    if (video.played.length === 0 && video.currentTime === 0) {
      const shown = decoded(poster);
      if (shown) return shown;
    }
    if (video.readyState >= 2 && video.videoWidth)
      return [video, video.videoWidth, video.videoHeight];
    return decoded(poster);
  }
  function paint({ canvas, context }: Layer, [image, width, height]: Drawable) {
    if (!context) return;
    // `object-cover`, as the backdrop of an image is drawn.
    const scale = Math.max(canvas.width / width, canvas.height / height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.filter = blur ? `blur(${blur}px)` : 'none';
    try {
      context.drawImage(
        image,
        (canvas.width - width * scale) / 2,
        (canvas.height - height * scale) / 2,
        width * scale,
        height * scale,
      );
    } catch {
      // A frame the browser cannot hand over leaves the last one in place.
    }
  }
  /** Draws what the video shows, fading over the last drawing. */
  function draw() {
    const started = performance.now();
    const since = started - drawnAt;
    drawnAt = started;
    const drawable = source();
    const [lower, upper] = layers;
    if (!lower || !upper || !drawable || !lower.canvas.width) return;
    upper.fade?.finish();
    // The canvas out of sight gets the drawing: the lower one while the upper
    // covers it, the upper one while it is clear.
    const next = painted ? 1 - front : 0;
    paint(layers[next]!, drawable);
    delete layers[front]!.canvas.dataset.front;
    layers[next]!.canvas.dataset.front = '';
    if (painted) {
      // Done a little before the next drawing is due, so that one never cuts
      // it short; a still video's comes at once.
      upper.fade = upper.canvas.animate?.(
        next === 1
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 1 }, { opacity: 0 }],
        {
          duration: 0.85 * Math.min(Math.max(since, interval), 2 * interval),
          easing: 'linear',
          fill: 'forwards',
        },
      );
    }
    front = next;
    painted = true;
    cost = cost * 0.75 + (performance.now() - started) * 0.25;
    interval = Math.max(FRAME_BACKDROP_INTERVAL, cost / DRAW_BUDGET);
  }
  function resize(width: number, height: number) {
    const pixelWidth = Math.max(1, Math.round(width / SCALE));
    const pixelHeight = Math.max(1, Math.round(height / SCALE));
    if (
      !layers.length ||
      layers.every(
        ({ canvas }) =>
          canvas.width === pixelWidth && canvas.height === pixelHeight,
      )
    )
      return;
    // Resizing a canvas clears it: the lower one is drawn again, under an
    // upper one left clear.
    for (const layer of layers) {
      layer.fade?.finish();
      layer.canvas.width = pixelWidth;
      layer.canvas.height = pixelHeight;
    }
    painted = false;
    draw();
  }
  function cancelFrame() {
    if (frameRequest !== undefined)
      video?.cancelVideoFrameCallback?.(frameRequest);
    frameRequest = undefined;
  }
  function onFrame(now: number) {
    frameRequest = undefined;
    if (!video || video.paused) return;
    if (now - drawnAt >= interval) draw();
    frameRequest = video.requestVideoFrameCallback(onFrame);
  }

  return {
    /** The backdrop: an element holding the two canvases. */
    attach(element: HTMLElement) {
      if (element === root) return;
      observer?.disconnect();
      root = element;
      layers = [...element.querySelectorAll('canvas')].map((canvas) => ({
        canvas,
        context: canvas.getContext('2d'),
      }));
      front = 0;
      painted = false;
      blur = canvasFilters()
        ? (parseFloat(
            getComputedStyle(element).getPropertyValue('--media-backdrop-blur'),
          ) || FALLBACK_BLUR) / SCALE
        : 0;
      resize(element.clientWidth, element.clientHeight);
      observer = new ResizeObserver(([entry]) => {
        if (entry) resize(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(element);
    },
    /** The video and the poster it is drawn from. */
    use(
      main: HTMLVideoElement | undefined,
      preview: HTMLImageElement | undefined,
    ) {
      if (main !== video) cancelFrame();
      video = main;
      poster = preview;
    },
    draw,
    /**
     * Keeps up with the video after one of its own events: a moving video is
     * drawn from its frames, a still one at once.
     */
    sync() {
      if (!video) return;
      if (video.paused || video.seeking || video.readyState < 3) {
        cancelFrame();
        draw();
        return;
      }
      if (typeof video.requestVideoFrameCallback === 'function') {
        frameRequest ??= video.requestVideoFrameCallback(onFrame);
      } else if (performance.now() - drawnAt >= interval) {
        draw();
      }
    },
    stop() {
      cancelFrame();
      observer?.disconnect();
      observer = undefined;
      for (const layer of layers) layer.fade?.cancel();
      root = undefined;
      layers = [];
      painted = false;
      video = undefined;
      poster = undefined;
      drawnAt = -Infinity;
      interval = FRAME_BACKDROP_INTERVAL;
      cost = 0;
    },
  };
}
