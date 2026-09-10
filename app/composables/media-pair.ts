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
import { restoredContentMediaTime } from '#layers/thei/shared/content-media-playback';

type Role = 'main' | 'backdrop' | 'preview' | 'previewBackdrop';
type Status = 'loading' | 'ready' | 'error';
type MediaElement = HTMLImageElement | HTMLVideoElement;

/** Owns readiness and playback only; the two presentations own their geometry. */
export function useMediaPair(
  props: MediaSurfaceProps,
  root: Readonly<Ref<HTMLElement | null>>,
  dimensions: (width: number, height: number) => void,
) {
  const active = ref(false);
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
  let savedTime = 0;
  let observer: IntersectionObserver | undefined;
  let motion: MediaQueryList | undefined;
  let firstFrame = 0;
  let secondFrame = 0;
  let starting = false;
  let command = 0;
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
    if (
      element instanceof HTMLVideoElement &&
      savedTime > 0 &&
      element.readyState >= 2
    ) {
      const time = restoredContentMediaTime(savedTime, element.duration);
      if (Math.abs(element.currentTime - time) > 0.01) {
        element.currentTime = time;
        return; // The restored frame must be available before revealing the pair.
      }
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
        if (!revealed.value) return;
        pauseVideos();
        if (role === 'main') synchronize(true);
      },
      seeked: (event: Event) => {
        if (status[role] === 'loading')
          void loaded(role, event.currentTarget as MediaElement);
        if (role === 'main') synchronize();
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
    if (active.value) return;
    active.value = true;
    requested.value =
      props.kind !== 'video' ||
      props.playback !== 'interaction' ||
      !previewSrc.value ||
      allowedPlayback.value;
    if (props.playback !== 'manual')
      wantsPlayback.value = allowedPlayback.value;
  }
  function leave() {
    const main = video('main');
    if (main && Number.isFinite(main.currentTime)) savedTime = main.currentTime;
    clear();
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
      savedTime = 0;
      wantsPlayback.value = allowedPlayback.value;
      ratio.value =
        props.width && props.height ? props.width / props.height : 1;
      if (wasActive) enter();
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
    if (!('IntersectionObserver' in window)) {
      enter();
      return;
    }
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) enter();
        else leave();
      },
      { threshold: 0.01 },
    );
    if (root.value) observer.observe(root.value);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    motion?.removeEventListener('change', updateMotion);
    document.removeEventListener('visibilitychange', updateVisibility);
    clear();
  });
  return {
    active,
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
