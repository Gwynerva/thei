import type { Ref } from 'vue';
import {
  AUDIO_OUTPUT_EXTENSION,
  AUDIO_PLAYBACK_RATES,
} from '#layers/thei/shared/audio';
import { getAssetMimeType } from '#layers/thei/shared/assets/formats';
import {
  applyMediaVolume,
  volumeSetTo,
  volumeToggled,
  type MediaVolume,
} from './media-volume';

/** The recording playing on this page: starting another pauses it. */
let playing: HTMLAudioElement | null = null;
/** The player the system's media controls belong to, if any. */
let sessionOwner: HTMLAudioElement | null = null;

const SESSION_ACTIONS = [
  'play',
  'pause',
  'seekto',
  'seekbackward',
  'seekforward',
] as const;
/** What the system's skip buttons jump by, when they do not say. */
const SESSION_SKIP = 10;

/** What a browser is asked whether it plays, by the file's extension. */
function playableType(extension: string): string {
  if (extension === AUDIO_OUTPUT_EXTENSION) return 'audio/webm; codecs="opus"';
  if (extension === 'opus') return 'audio/ogg; codecs="opus"';
  return getAssetMimeType(extension);
}

export interface AudioPlaybackOptions {
  /** The file's extension, to ask the browser whether it plays it. */
  extension: () => string | undefined;
  /** Seconds known before the file loads; the file's own length wins. */
  duration: () => number;
  /** What the system's media controls call the recording. */
  title: () => string | undefined;
}

/**
 * One recording's playback, around an `<audio>` that loads nothing until it
 * is played: what the player shows comes from the stored length and
 * waveform until the file says otherwise.
 *
 * Everything that touches the element or the page — one recording at a
 * time, the system's media controls — starts once the player is mounted, so
 * the page renders the same on the server and in the browser.
 */
export function useAudioPlayback(
  audio: Readonly<Ref<HTMLAudioElement | null | undefined>>,
  options: AudioPlaybackOptions,
) {
  const paused = ref(true);
  const current = ref(0);
  const fileDuration = ref(0);
  const rate = ref<number>(AUDIO_PLAYBACK_RATES[0]);
  const volume = ref(1);
  const muted = ref(false);
  const unsupported = ref(false);
  /** Waiting for data, after play or a seek. */
  const waiting = ref(false);

  const duration = computed(() => fileDuration.value || options.duration());
  const progress = computed(() =>
    duration.value > 0 ? Math.min(1, current.value / duration.value) : 0,
  );

  /** A position asked for before the file had loaded anything. */
  let pendingSeek: number | undefined;
  let frame: number | undefined;

  function element() {
    return audio.value ?? undefined;
  }

  function follow() {
    const el = element();
    if (!el) return;
    if (pendingSeek === undefined) current.value = el.currentTime;
    frame = requestAnimationFrame(follow);
  }

  function stopFollowing() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  }

  /** Starts loading the file's header without playing it. */
  function loadHeader(el: HTMLAudioElement) {
    if (el.readyState > 0 || el.preload !== 'none') return;
    el.preload = 'metadata';
    el.load();
  }

  async function play() {
    const el = element();
    if (!el || unsupported.value) return;
    // A load that failed — the connection dropped — is tried afresh, from
    // where the player stands.
    if (el.error) {
      if (current.value > 0) pendingSeek = current.value;
      el.load();
    }
    try {
      await el.play();
    } catch (error) {
      // A pause before the file answered aborts the play, which is no fault.
      if (error instanceof DOMException && error.name === 'NotSupportedError') {
        unsupported.value = true;
      }
    }
  }

  function pause() {
    element()?.pause();
  }

  function toggle() {
    if (paused.value) void play();
    else pause();
  }

  function seek(time: number) {
    const el = element();
    if (!el) return;
    const end = duration.value;
    const target = Math.max(0, end > 0 ? Math.min(time, end) : time);
    current.value = target;
    if (el.readyState === 0) {
      pendingSeek = target;
      loadHeader(el);
      return;
    }
    pendingSeek = undefined;
    el.currentTime = target;
    updatePositionState();
  }

  function seekBy(seconds: number) {
    seek(current.value + seconds);
  }

  function cycleRate() {
    const el = element();
    const index = AUDIO_PLAYBACK_RATES.indexOf(
      rate.value as (typeof AUDIO_PLAYBACK_RATES)[number],
    );
    const next =
      AUDIO_PLAYBACK_RATES[(index + 1) % AUDIO_PLAYBACK_RATES.length]!;
    rate.value = next;
    if (el) {
      el.defaultPlaybackRate = next;
      el.playbackRate = next;
    }
    updatePositionState();
  }

  function setLoudness(next: MediaVolume) {
    volume.value = next.volume;
    muted.value = next.muted;
    const el = element();
    if (el) applyMediaVolume(el, next);
  }

  function setVolume(value: number) {
    setLoudness(volumeSetTo(value));
  }

  function toggleMute() {
    setLoudness(volumeToggled({ volume: volume.value, muted: muted.value }));
  }

  function updatePositionState() {
    const el = element();
    if (!el || sessionOwner !== el || !('mediaSession' in navigator)) return;
    const end = duration.value;
    if (!(end > 0)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: end,
        playbackRate: el.playbackRate || 1,
        position: Math.min(end, Math.max(0, el.currentTime)),
      });
    } catch {
      // A browser that keeps no position for the system's controls.
    }
  }

  function claimMediaSession(el: HTMLAudioElement) {
    if (!('mediaSession' in navigator)) return;
    sessionOwner = el;
    const session = navigator.mediaSession;
    // The site's own icon, as the page's head already links it.
    const icon = document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]',
    )?.href;
    try {
      session.metadata = new MediaMetadata({
        title: options.title() || document.title,
        ...(icon
          ? { artwork: [{ src: icon, sizes: '180x180', type: 'image/png' }] }
          : {}),
      });
    } catch {
      // Metadata the browser refuses leaves the controls without a title.
    }
    const handlers: Record<
      (typeof SESSION_ACTIONS)[number],
      MediaSessionActionHandler
    > = {
      play: () => void play(),
      pause: () => pause(),
      seekto: (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      },
      seekbackward: (details) => seekBy(-(details.seekOffset ?? SESSION_SKIP)),
      seekforward: (details) => seekBy(details.seekOffset ?? SESSION_SKIP),
    };
    for (const action of SESSION_ACTIONS) {
      try {
        session.setActionHandler(action, handlers[action]);
      } catch {
        // An action this browser does not know.
      }
    }
    updatePositionState();
  }

  function releaseMediaSession(el: HTMLAudioElement) {
    if (sessionOwner !== el || !('mediaSession' in navigator)) return;
    sessionOwner = null;
    const session = navigator.mediaSession;
    for (const action of SESSION_ACTIONS) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // An action this browser does not know.
      }
    }
    session.metadata = null;
  }

  const listeners: [string, (event: Event) => void][] = [
    [
      'play',
      () => {
        const el = element()!;
        if (playing && playing !== el) playing.pause();
        playing = el;
        paused.value = false;
        claimMediaSession(el);
        stopFollowing();
        follow();
      },
    ],
    [
      'pause',
      () => {
        paused.value = true;
        stopFollowing();
        current.value = element()!.currentTime;
        updatePositionState();
      },
    ],
    [
      'ended',
      () => {
        paused.value = true;
        stopFollowing();
        current.value = duration.value;
      },
    ],
    [
      'loadedmetadata',
      () => {
        const el = element()!;
        if (pendingSeek !== undefined) {
          el.currentTime = pendingSeek;
          pendingSeek = undefined;
        }
        el.playbackRate = rate.value;
      },
    ],
    [
      'durationchange',
      () => {
        const value = element()!.duration;
        if (Number.isFinite(value) && value > 0) fileDuration.value = value;
        updatePositionState();
      },
    ],
    ['ratechange', () => updatePositionState()],
    ['seeked', () => updatePositionState()],
    ['waiting', () => (waiting.value = true)],
    ['playing', () => (waiting.value = false)],
    ['canplay', () => (waiting.value = false)],
    [
      'error',
      () => {
        paused.value = true;
        waiting.value = false;
        stopFollowing();
        // Only a file the browser cannot play is said to be unplayable; a
        // failed request may well succeed when play is pressed again.
        if (element()?.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)
          unsupported.value = true;
      },
    ],
  ];

  onMounted(() => {
    const el = element();
    if (!el) return;
    const type = options.extension();
    if (type && !el.canPlayType(playableType(type))) unsupported.value = true;
    for (const [name, handler] of listeners) el.addEventListener(name, handler);
  });

  onBeforeUnmount(() => {
    stopFollowing();
    const el = element();
    if (!el) return;
    for (const [name, handler] of listeners) {
      el.removeEventListener(name, handler);
    }
    el.pause();
    if (playing === el) playing = null;
    releaseMediaSession(el);
  });

  return {
    paused,
    current,
    duration,
    progress,
    rate,
    volume,
    muted,
    unsupported,
    waiting,
    play,
    pause,
    toggle,
    seek,
    seekBy,
    cycleRate,
    setVolume,
    toggleMute,
  };
}
