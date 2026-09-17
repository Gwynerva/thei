/**
 * Playback controller for the asset modal players.
 *
 * One video is the master clock: its time, duration, volume and play state are
 * what the controls show. Followers (the other side of a comparison) are always
 * muted and are kept on the master's timeline: seeks wait for every element to
 * land before resuming, a buffering element holds the others, and drift is
 * corrected with a small playback rate nudge or, when large, a jump.
 */

export interface VideoPlaybackState {
  paused: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  volume: number;
}

/** Drift beyond this is corrected with a seek instead of a rate nudge. */
export const VIDEO_SYNC_JUMP_THRESHOLD = 0.3;
/** Drift below this is ignored. */
export const VIDEO_SYNC_TOLERANCE = 0.04;
export const VIDEO_SYNC_INTERVAL_MS = 200;
/** A seek that never reports `seeked` must not block playback forever. */
export const VIDEO_SEEK_TIMEOUT_MS = 3000;
/** Pressing play this close to the end restarts from the beginning. */
const END_EPSILON = 0.05;

type Listener = [string, (event: Event) => void];

function finiteDuration(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 0;
}

export class VideoPlaybackController {
  private master: HTMLVideoElement | null = null;
  private followers: HTMLVideoElement[] = [];
  private listeners = new Map<HTMLVideoElement, Listener[]>();
  private wantsPlay = false;
  private seekToken = 0;
  private seeking = false;
  private stalled = new Set<HTMLVideoElement>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private state: VideoPlaybackState = {
    paused: true,
    currentTime: 0,
    duration: 0,
    muted: false,
    volume: 1,
  };

  constructor(private readonly onChange: (state: VideoPlaybackState) => void) {}

  get snapshot(): VideoPlaybackState {
    return { ...this.state };
  }

  attach(
    master: HTMLVideoElement | null | undefined,
    followers: (HTMLVideoElement | null | undefined)[] = [],
  ): void {
    const nextFollowers = followers.filter(
      (video): video is HTMLVideoElement => Boolean(video) && video !== master,
    );
    if (
      this.master === (master ?? null) &&
      nextFollowers.length === this.followers.length &&
      nextFollowers.every((video, index) => video === this.followers[index])
    ) {
      return;
    }

    this.detach();
    this.master = master ?? null;
    this.followers = nextFollowers;
    if (!this.master) {
      this.emit({ paused: true, currentTime: 0, duration: 0 });
      return;
    }

    this.master.volume = this.state.volume;
    this.master.muted = this.state.muted;
    for (const follower of this.followers) follower.muted = true;

    this.listen(this.master, [
      ['loadedmetadata', () => this.updateDuration()],
      ['durationchange', () => this.updateDuration()],
      ['timeupdate', () => this.onMasterTime()],
      ['play', () => this.onMasterPlay()],
      ['pause', () => this.onMasterPause()],
      ['ended', () => this.onMasterEnded()],
      ['volumechange', () => this.onMasterVolume()],
    ]);
    for (const video of this.all()) {
      this.listen(video, [
        ['waiting', () => this.onWaiting(video)],
        ['playing', () => this.onResumed(video)],
        ['canplay', () => this.onResumed(video)],
      ]);
    }
    for (const follower of this.followers) {
      this.listen(follower, [['volumechange', () => (follower.muted = true)]]);
    }

    this.wantsPlay = false;
    this.seeking = false;
    this.stalled.clear();
    this.emit({
      paused: true,
      currentTime: this.master.currentTime || 0,
      duration: finiteDuration(this.master),
    });
  }

  detach(): void {
    this.stopSyncLoop();
    for (const [video, listeners] of this.listeners) {
      for (const [name, handler] of listeners) {
        video.removeEventListener(name, handler);
      }
    }
    this.listeners.clear();
    this.seekToken++;
    this.seeking = false;
    this.wantsPlay = false;
    this.stalled.clear();
    this.master = null;
    this.followers = [];
  }

  togglePlay(): void {
    if (this.wantsPlay) this.pause();
    else void this.play();
  }

  async play(): Promise<void> {
    const master = this.master;
    if (!master) return;
    const duration = finiteDuration(master);
    this.wantsPlay = true;
    this.emit({ paused: false });
    if (
      master.ended ||
      (duration > 0 && master.currentTime >= duration - END_EPSILON)
    ) {
      await this.seek(0);
      return;
    }
    if (this.seeking) return;
    await this.startAll();
  }

  pause(): void {
    this.wantsPlay = false;
    this.stopSyncLoop();
    this.pauseAll();
    this.emit({ paused: true });
  }

  async seek(time: number): Promise<void> {
    const master = this.master;
    if (!master) return;
    const duration = finiteDuration(master);
    const target = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
    const token = ++this.seekToken;
    this.seeking = true;
    this.stopSyncLoop();
    this.stalled.clear();
    this.emit({ currentTime: target });
    this.pauseAll();

    await Promise.all(
      this.all().map((video) => seekVideo(video, clampTo(video, target))),
    );
    if (token !== this.seekToken || this.master !== master) return;

    this.seeking = false;
    this.emit({ currentTime: master.currentTime });
    if (this.wantsPlay) await this.startAll();
  }

  setVolume(value: number): void {
    const volume = Math.min(1, Math.max(0, value));
    this.state.volume = volume;
    if (this.master) {
      this.master.volume = volume;
      this.master.muted = volume === 0;
    }
    this.emit({ volume, muted: volume === 0 });
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    if (this.master) {
      this.master.muted = muted;
      if (!muted && this.master.volume === 0) this.master.volume = 1;
    }
    this.emit({
      muted,
      volume: !muted && this.state.volume === 0 ? 1 : this.state.volume,
    });
  }

  /** Aligns followers with the master; exposed for tests. */
  synchronize(): void {
    const master = this.master;
    if (!master || this.seeking || this.stalled.size) return;
    for (const follower of this.followers) {
      const target = clampTo(follower, master.currentTime);
      const followerDuration = finiteDuration(follower);
      if (followerDuration > 0 && master.currentTime >= followerDuration) {
        follower.playbackRate = master.playbackRate;
        if (!follower.paused) follower.pause();
        continue;
      }
      const drift = follower.currentTime - target;
      if (Math.abs(drift) > VIDEO_SYNC_JUMP_THRESHOLD) {
        follower.playbackRate = master.playbackRate;
        follower.currentTime = target;
      } else if (Math.abs(drift) > VIDEO_SYNC_TOLERANCE) {
        const nudge = Math.max(-0.1, Math.min(0.1, drift * 0.5));
        follower.playbackRate = master.playbackRate * (1 - nudge);
      } else {
        follower.playbackRate = master.playbackRate;
      }
      if (this.wantsPlay && follower.paused && !master.paused) {
        void follower.play().catch(() => undefined);
      }
    }
  }

  private all(): HTMLVideoElement[] {
    return this.master ? [this.master, ...this.followers] : [];
  }

  private listen(video: HTMLVideoElement, listeners: Listener[]): void {
    for (const [name, handler] of listeners) {
      video.addEventListener(name, handler);
    }
    this.listeners.set(video, [
      ...(this.listeners.get(video) ?? []),
      ...listeners,
    ]);
  }

  private emit(patch: Partial<VideoPlaybackState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.snapshot);
  }

  private pauseAll(): void {
    for (const video of this.all()) {
      if (!video.paused) video.pause();
    }
  }

  private async startAll(): Promise<void> {
    const master = this.master;
    if (!master) return;
    for (const follower of this.followers) {
      follower.muted = true;
      follower.playbackRate = master.playbackRate;
      const target = clampTo(follower, master.currentTime);
      if (Math.abs(follower.currentTime - target) > VIDEO_SYNC_TOLERANCE) {
        follower.currentTime = target;
      }
    }
    const token = this.seekToken;
    const [masterResult] = await Promise.allSettled(
      this.all()
        .filter(
          (video) =>
            video === master ||
            finiteDuration(video) === 0 ||
            master.currentTime < finiteDuration(video),
        )
        .map((video) => video.play()),
    );
    if (token !== this.seekToken || this.master !== master) return;
    if (masterResult?.status === 'rejected') {
      this.pause();
      return;
    }
    if (!this.wantsPlay) {
      this.pauseAll();
      return;
    }
    this.startSyncLoop();
  }

  private startSyncLoop(): void {
    if (this.syncTimer || !this.followers.length) return;
    this.syncTimer = setInterval(
      () => this.synchronize(),
      VIDEO_SYNC_INTERVAL_MS,
    );
  }

  private stopSyncLoop(): void {
    if (!this.syncTimer) return;
    clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  private updateDuration(): void {
    if (this.master) this.emit({ duration: finiteDuration(this.master) });
  }

  private onMasterTime(): void {
    if (!this.master || this.seeking) return;
    this.emit({ currentTime: this.master.currentTime });
  }

  private onMasterPlay(): void {
    // A play event queued before a pause of ours reports a paused element.
    if (this.wantsPlay || this.seeking || this.master?.paused) return;
    // Started from outside the controls, e.g. hardware media keys.
    void this.play();
  }

  private onMasterPause(): void {
    const master = this.master;
    if (!master || !master.paused || master.ended) return;
    if (!this.wantsPlay || this.seeking || this.stalled.size) return;
    // Paused from outside the controls.
    this.pause();
  }

  private onMasterEnded(): void {
    const master = this.master;
    if (!master) return;
    this.wantsPlay = false;
    this.stopSyncLoop();
    this.pauseAll();
    for (const follower of this.followers) follower.playbackRate = 1;
    this.emit({
      paused: true,
      currentTime: finiteDuration(master) || master.currentTime,
    });
  }

  private onMasterVolume(): void {
    const master = this.master;
    if (!master) return;
    if (
      master.muted === this.state.muted &&
      master.volume === this.state.volume
    ) {
      return;
    }
    this.emit({ muted: master.muted, volume: master.volume });
  }

  private onWaiting(video: HTMLVideoElement): void {
    if (!this.wantsPlay || this.seeking) return;
    this.stalled.add(video);
    this.stopSyncLoop();
    for (const other of this.all()) {
      if (other !== video && !other.paused) other.pause();
    }
  }

  private onResumed(video: HTMLVideoElement): void {
    if (!this.stalled.delete(video) || this.stalled.size) return;
    if (this.wantsPlay && !this.seeking) void this.startAll();
  }
}

function clampTo(video: HTMLVideoElement, time: number): number {
  const duration = finiteDuration(video);
  return duration > 0 ? Math.min(time, duration) : time;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  // Without metadata the position is applied once the media loads.
  if (video.readyState === 0) {
    video.currentTime = time;
    return Promise.resolve();
  }
  if (Math.abs(video.currentTime - time) < 0.001 && !video.seeking) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    const timer = setTimeout(done, VIDEO_SEEK_TIMEOUT_MS);
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}
