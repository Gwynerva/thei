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
 * Owns readiness and playback only; the two presentations own their geometry.
 *
 * Media starts loading the first time it scrolls into view and then stays
 * mounted: the browser already keeps offscreen images cheap, while unmounting
 * would decode, seek and fade the same bytes in again on every return. Only
 * videos keep watching the viewport, to pause while nobody can see them.
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
  let starting = false;
  let command = 0;
  let playbackIntentInitialized = false;
  const expectedPauses = new WeakSet<HTMLVideoElement>();

  function video(role: Role) {
    const element = elements[role];
    return element instanceof HTMLVideoElement ? element : undefined;
  }
  function pauseVideos() {
    command++;
    starting = false;
    for (const role of ['main', 'backdrop'] as const) {
      const element = video(role);
      if (element && !element.paused) {
        expectedPauses.add(element);
        element.pause();
      }
    }
  }
  function synchronize(force = false) {
    const main = video('main');
    const backdrop = video('backdrop');
    if (!main || !backdrop || status.backdrop !== 'ready') return;
    backdrop.playbackRate = main.playbackRate;
    if (force || Math.abs(backdrop.currentTime - main.currentTime) > 0.08) {
      if (Math.abs(backdrop.currentTime - main.currentTime) > 0.01)
        backdrop.currentTime = main.currentTime;
    }
  }
  async function startVideos() {
    const main = video('main');
    const backdrop =
      status.backdrop === 'ready' ? video('backdrop') : undefined;
    if (
      props.suspended ||
      !active.value ||
      !inView.value ||
      document.hidden ||
      !revealed.value ||
      !wantsPlayback.value ||
      !main ||
      starting
    )
      return;
    const pair = backdrop ? [main, backdrop] : [main];
    if (pair.some((element) => element.seeking || element.readyState < 3))
      return;
    if (pair.every((element) => !element.paused)) return;
    synchronize();
    if (backdrop?.seeking) return;
    starting = true;
    const currentCommand = ++command;
    const outcomes = await Promise.allSettled(
      pair.map((element) => element.play()),
    );
    if (currentCommand !== command) return;
    starting = false;
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      wantsPlayback.value = false;
      pauseVideos();
    }
  }
  function reveal() {
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    const current = generation.value;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!active.value || current !== generation.value) return;
        if (previewReady.value) previewRevealed.value = true;
        if (originalReady.value) {
          revealed.value = true;
          void nextTick(startVideos);
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
    const handlers: Record<string, (event: Event) => void> = {
      load: (event: Event) =>
        void loaded(role, event.currentTarget as MediaElement),
      loadeddata: (event: Event) =>
        void loaded(role, event.currentTarget as MediaElement),
      error: (event: Event) => fail(role, event.currentTarget as MediaElement),
      canplay: () => void startVideos(),
      play: () => {
        if (role !== 'main' || starting) return;
        if (props.playback === 'interaction' && !allowedPlayback.value) {
          pauseVideos();
          return;
        }
        wantsPlayback.value = true;
        void startVideos();
      },
      pause: (event: Event) => {
        const element = event.currentTarget as HTMLVideoElement;
        if (expectedPauses.delete(element) || role !== 'main') return;
        wantsPlayback.value = false;
        pauseVideos();
      },
      waiting: () => {
        if (revealed.value) pauseVideos();
      },
      seeking: () => {
        // Backdrop seeks are drift corrections and must not stall the video.
        if (!revealed.value || role !== 'main') return;
        pauseVideos();
        synchronize(true);
      },
      seeked: (event: Event) => {
        if (status[role] === 'loading')
          void loaded(role, event.currentTarget as MediaElement);
        if (role === 'main') synchronize();
        // Resumes a pair whose other half finished seeking first.
        void startVideos();
      },
      ratechange: () => {
        if (role === 'main') synchronize();
      },
      timeupdate: () => {
        if (role === 'main') synchronize();
      },
      ended: () => {
        if (role === 'main') {
          synchronize(true);
          pauseVideos();
        }
      },
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
    if (active.value) {
      void startVideos();
      return;
    }
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
  function leave() {
    inView.value = false;
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
  async function play() {
    if (
      props.suspended ||
      (props.playback === 'interaction' && !allowedPlayback.value)
    )
      return;
    wantsPlayback.value = true;
    requested.value = true;
    await startVideos();
  }
  function pause() {
    wantsPlayback.value = false;
    pauseVideos();
  }
  watch(allowedPlayback, (value) => {
    wantsPlayback.value = value;
    if (value) {
      requested.value = true;
      void startVideos();
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
  function updateVisibility() {
    if (document.hidden) pauseVideos();
    else void startVideos();
  }
  onMounted(() => {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    updateMotion();
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    watchViewport();
  });
  onBeforeUnmount(() => {
    stopObserving?.();
    motion?.removeEventListener('change', updateMotion);
    document.removeEventListener('visibilitychange', updateVisibility);
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
