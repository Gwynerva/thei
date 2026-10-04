import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type ComponentPublicInstance,
  type Ref,
} from 'vue';
import type { MediaSurfaceProps } from '#layers/thei/shared/media';
import { observeViewport } from './viewport-observer';

type Role = 'main' | 'backdrop' | 'preview' | 'previewBackdrop';
type Status = 'loading' | 'ready' | 'error';
type MediaElement = HTMLImageElement | HTMLVideoElement;

/**
 * The blurred backdrop may lag the main video this far before it is moved to
 * the main video's time: the blur hides it, and a seek stalls the backdrop.
 */
const BACKDROP_DRIFT = 0.25;
const BACKDROP_STILL_DRIFT = 0.04;

/**
 * Owns readiness and playback only; the two presentations own their geometry.
 *
 * Media starts loading the first time it scrolls into view and then stays
 * mounted: the browser already keeps offscreen images cheap, while unmounting
 * would decode, seek and fade the same bytes in again on every return. Only
 * videos keep watching the viewport, to pause while nobody can see them.
 *
 * A video on screen is left alone. Only entering the viewport starts it (once
 * it is ready, if it was not yet), and only leaving pauses it, after noting
 * whether it was playing: that is how a pause made with its own controls is
 * kept, without listening for one. Buffering, seeking and looping belong to
 * the browser; pausing and resuming around them showed a phone's controls
 * over the video on every loop. A hidden tab is left to the browser too. Only
 * deliberate signals act on a video in view: the pointer or focus over a tile
 * that plays while engaged, the reduced motion setting, a new source. The
 * backdrop copies the main video and never steers it.
 */
export function useMediaPair(
  props: MediaSurfaceProps,
  root: Readonly<Ref<HTMLElement | null>>,
  dimensions: (width: number, height: number) => void,
) {
  const active = ref(false);
  const inView = ref(false);
  const generation = ref(0);
  const requested = ref(false);
  const revealed = ref(false);
  const previewRevealed = ref(false);
  const reducedMotion = ref(true);
  const ratio = ref(
    props.width && props.height ? props.width / props.height : 1,
  );
  const status = reactive<Record<Role, Status>>({
    main: 'loading',
    backdrop: 'loading',
    preview: 'loading',
    previewBackdrop: 'loading',
  });
  const elements: Partial<Record<Role, MediaElement>> = {};
  const previewSrc = computed(
    () => props.previewSrc || (props.kind !== 'video' ? props.src : ''),
  );
  const previewReady = computed(
    () =>
      status.preview === 'ready' &&
      (!props.backdrop || status.previewBackdrop === 'ready'),
  );
  const originalReady = computed(
    () =>
      status.main === 'ready' &&
      (!props.backdrop ||
        status.backdrop === 'ready' ||
        (status.backdrop === 'error' &&
          (!previewSrc.value || status.previewBackdrop !== 'loading'))),
  );
  const previewWanted = computed(
    () => !requested.value || status.main === 'error',
  );
  const loading = computed(
    () =>
      active.value &&
      status.main !== 'error' &&
      (previewWanted.value
        ? !previewRevealed.value && status.preview !== 'error'
        : !revealed.value),
  );
  const phase = computed(() =>
    !active.value
      ? 'idle'
      : status.main === 'error'
        ? 'error'
        : revealed.value
          ? 'visible'
          : requested.value
            ? 'loading'
            : 'idle',
  );
  const previewPhase = computed(() =>
    !active.value || !previewSrc.value
      ? 'idle'
      : status.preview === 'error'
        ? 'error'
        : previewRevealed.value
          ? 'visible'
          : 'loading',
  );
  const wantsPlayback = ref(false);
  const allowedPlayback = computed(
    () =>
      !props.suspended &&
      (!reducedMotion.value ||
        (props.playback === 'autoplay' &&
          Boolean(props.autoplayReducedMotion))) &&
      (props.playback === 'interaction'
        ? Boolean(props.engaged)
        : props.playback === 'autoplay'),
  );
  let stopObserving: (() => void) | undefined;
  let motion: MediaQueryList | undefined;
  let firstFrame = 0;
  let secondFrame = 0;
  let playbackIntentInitialized = false;

  function video(role: Role) {
    const element = elements[role];
    return element instanceof HTMLVideoElement ? element : undefined;
  }
  function pauseVideos() {
    for (const role of ['main', 'backdrop'] as const) {
      const element = video(role);
      if (element && !element.paused) element.pause();
    }
  }
  /**
   * Asks the main video to play, once. Without data yet the browser starts it
   * as soon as it can; a refused start, for blocked autoplay or a pause of
   * ours, simply leaves it paused.
   */
  function start() {
    const main = video('main');
    if (
      !main?.paused ||
      props.suspended ||
      !active.value ||
      !inView.value ||
      !revealed.value ||
      status.main === 'error' ||
      !wantsPlayback.value
    )
      return;
    main.play().catch(() => {});
  }
  /** Keeps the backdrop on the main video's time, rate and motion. */
  function follow() {
    const main = video('main');
    const backdrop =
      status.backdrop === 'ready' ? video('backdrop') : undefined;
    if (!main || !backdrop) return;
    if (backdrop.playbackRate !== main.playbackRate)
      backdrop.playbackRate = main.playbackRate;
    const moving = !main.paused && main.readyState >= 3;
    // A still frame stays in sight, so a still backdrop matches it closely.
    const drift = moving ? BACKDROP_DRIFT : BACKDROP_STILL_DRIFT;
    if (
      !main.seeking &&
      Math.abs(backdrop.currentTime - main.currentTime) > drift
    )
      backdrop.currentTime = main.currentTime;
    if (moving && backdrop.paused) backdrop.play().catch(() => {});
    else if (!moving && !backdrop.paused) backdrop.pause();
  }
  function reveal() {
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    const current = generation.value;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!active.value || current !== generation.value) return;
        if (previewReady.value) previewRevealed.value = true;
        if (originalReady.value && !revealed.value) {
          revealed.value = true;
          // The rest of entering: the video did not exist yet.
          void nextTick(start);
        }
      });
    });
  }
  async function loaded(role: Role, element: MediaElement) {
    const current = generation.value;
    if (
      !active.value ||
      elements[role] !== element ||
      status[role] !== 'loading'
    )
      return;
    if (element instanceof HTMLImageElement) {
      try {
        await element.decode();
      } catch {
        fail(role, element);
        return;
      }
    }
    if (
      !active.value ||
      current !== generation.value ||
      elements[role] !== element
    )
      return;
    const width =
      element instanceof HTMLVideoElement
        ? element.videoWidth
        : element.naturalWidth;
    const height =
      element instanceof HTMLVideoElement
        ? element.videoHeight
        : element.naturalHeight;
    if (!width || !height) {
      fail(role, element);
      return;
    }
    status[role] = 'ready';
    if (role === 'main' || (role === 'preview' && previewWanted.value)) {
      ratio.value = width / height;
      dimensions(width, height);
    }
    reveal();
  }
  function register(
    role: Role,
    element: Element | ComponentPublicInstance | null,
  ) {
    if (!(
      element instanceof HTMLImageElement || element instanceof HTMLVideoElement
    )) {
      delete elements[role];
      return;
    }
    if (elements[role] === element) return;
    elements[role] = element;
    if (
      (element instanceof HTMLImageElement &&
        element.complete &&
        element.naturalWidth) ||
      (element instanceof HTMLVideoElement && element.readyState >= 2)
    )
      void loaded(role, element);
  }
  function fail(role: Role, element: MediaElement) {
    if (!active.value || elements[role] !== element) return;
    status[role] = 'error';
    if (role === 'preview' && !requested.value) requested.value = true;
    if (role === 'main') pauseVideos();
    if (role === 'backdrop') video('backdrop')?.pause();
    reveal();
  }
  function events(role: Role) {
    // Only the main video's own events move the backdrop; neither video's
    // events ever start or pause the main one.
    const followMain = () => {
      if (role === 'main') follow();
    };
    const handlers: Record<string, (event: Event) => void> = {
      load: (event: Event) =>
        void loaded(role, event.currentTarget as MediaElement),
      loadeddata: (event: Event) =>
        void loaded(role, event.currentTarget as MediaElement),
      error: (event: Event) => fail(role, event.currentTarget as MediaElement),
      seeked: (event: Event) => {
        if (status[role] === 'loading')
          void loaded(role, event.currentTarget as MediaElement);
        followMain();
      },
      playing: followMain,
      pause: followMain,
      waiting: followMain,
      ratechange: followMain,
      timeupdate: followMain,
    };
    return Object.fromEntries(
      Object.entries(handlers).map(([name, handle]) => [
        name,
        (event: Event) => {
          if (active.value && event.currentTarget === elements[role])
            handle(event);
        },
      ]),
    );
  }
  function clear() {
    generation.value++;
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    pauseVideos();
    active.value = false;
    revealed.value = false;
    previewRevealed.value = false;
    for (const role of Object.keys(status) as Role[]) status[role] = 'loading';
  }
  function enter() {
    inView.value = true;
    if (!active.value) {
      active.value = true;
      requested.value =
        props.kind !== 'video' ||
        props.playback !== 'interaction' ||
        !previewSrc.value ||
        allowedPlayback.value;
      if (!playbackIntentInitialized && props.playback !== 'manual')
        wantsPlayback.value = allowedPlayback.value;
      playbackIntentInitialized = true;
    }
    start();
  }
  function leave() {
    inView.value = false;
    const main = video('main');
    // A video comes back doing what it was left doing, whether its own
    // controls or the autoplay got it there. A tile that plays while engaged
    // follows the engagement instead.
    if (main && revealed.value && props.playback !== 'interaction')
      wantsPlayback.value = !main.paused;
    pauseVideos();
  }
  function watchViewport() {
    stopObserving?.();
    stopObserving = undefined;
    if (!root.value) return;
    stopObserving = observeViewport(root.value, (visible) => {
      if (visible) enter();
      else leave();
      // Once shown, an image has nothing left to do with the viewport.
      if (visible && props.kind !== 'video') {
        stopObserving?.();
        stopObserving = undefined;
      }
    });
  }
  function play() {
    if (
      props.suspended ||
      (props.playback === 'interaction' && !allowedPlayback.value)
    )
      return;
    wantsPlayback.value = true;
    requested.value = true;
    start();
  }
  function pause() {
    wantsPlayback.value = false;
    pauseVideos();
  }
  watch(allowedPlayback, (value) => {
    wantsPlayback.value = value;
    if (value) {
      requested.value = true;
      start();
    } else pauseVideos();
  });
  watch(
    () => props.suspended,
    (value) => {
      if (value) pauseVideos();
    },
  );
  watch(
    () => [props.src, props.previewSrc, props.kind, props.backdrop],
    () => {
      const wasActive = active.value;
      clear();
      playbackIntentInitialized = false;
      wantsPlayback.value = false;
      ratio.value =
        props.width && props.height ? props.width / props.height : 1;
      if (wasActive && inView.value) enter();
      // New media reports its own first appearance, and a video keeps
      // reporting so it can pause offscreen.
      watchViewport();
    },
  );
  function updateMotion() {
    reducedMotion.value = motion?.matches ?? true;
  }
  onMounted(() => {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    updateMotion();
    motion.addEventListener('change', updateMotion);
    watchViewport();
  });
  onBeforeUnmount(() => {
    stopObserving?.();
    motion?.removeEventListener('change', updateMotion);
    clear();
  });
  return {
    active,
    inView,
    generation,
    requested,
    revealed,
    previewRevealed,
    previewWanted,
    previewSrc,
    loading,
    phase,
    previewPhase,
    ratio,
    status,
    register,
    events,
    play,
    pause,
  };
}
