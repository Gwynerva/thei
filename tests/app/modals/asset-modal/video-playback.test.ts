import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  VIDEO_SYNC_INTERVAL_MS,
  VideoPlaybackController,
  type VideoPlaybackState,
} from '../../../../app/modals/asset-modal/video-playback';

/** Minimal media element: seeks land after `seekDelay` ms, play succeeds. */
class FakeVideo extends EventTarget {
  paused = true;
  ended = false;
  seeking = false;
  readyState = 4;
  muted = false;
  volume = 1;
  playbackRate = 1;
  playResult: 'resolve' | 'reject' = 'resolve';
  private time = 0;

  constructor(
    public duration: number,
    public seekDelay = 10,
  ) {
    super();
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.ended = false;
    this.seeking = true;
    this.dispatchEvent(new Event('seeking'));
    setTimeout(() => {
      this.seeking = false;
      this.dispatchEvent(new Event('seeked'));
    }, this.seekDelay);
  }

  /** Advances playback without firing seek events. */
  advance(seconds: number) {
    if (this.paused) return;
    this.time = Math.min(
      this.duration,
      this.time + seconds * this.playbackRate,
    );
    this.dispatchEvent(new Event('timeupdate'));
    if (this.time >= this.duration) {
      this.paused = true;
      this.ended = true;
      this.dispatchEvent(new Event('pause'));
      this.dispatchEvent(new Event('ended'));
    }
  }

  play() {
    if (this.playResult === 'reject') {
      return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    }
    if (this.paused) {
      this.paused = false;
      this.ended = false;
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
    }
    return Promise.resolve();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

function setup(masterDuration = 10, followerDuration = 10) {
  const master = new FakeVideo(masterDuration);
  const follower = new FakeVideo(followerDuration, 40);
  let state: VideoPlaybackState | undefined;
  const controller = new VideoPlaybackController((next) => (state = next));
  controller.attach(master as unknown as HTMLVideoElement, [
    follower as unknown as HTMLVideoElement,
  ]);
  return { master, follower, controller, state: () => state! };
}

describe('video playback controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('keeps the follower muted and silent regardless of master volume', () => {
    const { master, follower, controller } = setup();
    controller.toggleMute();
    controller.toggleMute();
    controller.setVolume(0.4);
    expect(master.volume).toBe(0.4);
    expect(master.muted).toBe(false);
    expect(follower.muted).toBe(true);
  });

  test('a seek while playing waits for both sides before resuming', async () => {
    const { master, follower, controller, state } = setup();
    await controller.play();
    expect(master.paused).toBe(false);

    const seek = controller.seek(6);
    expect(master.paused).toBe(true);
    expect(follower.paused).toBe(true);
    expect(state().paused).toBe(false);

    await vi.advanceTimersByTimeAsync(15);
    // The master landed first but the follower is still seeking.
    expect(master.paused).toBe(true);

    await vi.advanceTimersByTimeAsync(30);
    await seek;
    expect(master.currentTime).toBe(6);
    expect(follower.currentTime).toBe(6);
    expect(master.paused).toBe(false);
    expect(follower.paused).toBe(false);
  });

  test('rapid scrubbing resumes once, at the last position', async () => {
    const { master, follower, controller } = setup();
    await controller.play();
    void controller.seek(2);
    void controller.seek(3);
    const last = controller.seek(7);
    await vi.advanceTimersByTimeAsync(100);
    await last;
    expect(master.currentTime).toBe(7);
    expect(follower.currentTime).toBe(7);
    expect(master.paused).toBe(false);
  });

  test('replaying after the end restarts both sides from zero', async () => {
    const { master, follower, controller, state } = setup(10, 10.2);
    await controller.play();
    master.advance(10);
    follower.advance(10);
    expect(state().paused).toBe(true);
    expect(follower.paused).toBe(true);

    const replay = controller.play();
    await vi.advanceTimersByTimeAsync(100);
    await replay;
    expect(master.currentTime).toBe(0);
    expect(follower.currentTime).toBe(0);
    expect(master.paused).toBe(false);
    expect(follower.paused).toBe(false);
    expect(state().paused).toBe(false);
  });

  test('corrects drift with a rate nudge or a jump', async () => {
    const { master, follower, controller } = setup();
    await controller.play();

    master.advance(1);
    follower.advance(0.9);
    await vi.advanceTimersByTimeAsync(VIDEO_SYNC_INTERVAL_MS);
    expect(follower.playbackRate).toBeGreaterThan(1);

    master.advance(1);
    await vi.advanceTimersByTimeAsync(VIDEO_SYNC_INTERVAL_MS);
    expect(follower.currentTime).toBeCloseTo(master.currentTime);
  });

  test('a buffering side holds the other one', async () => {
    const { master, follower, controller, state } = setup();
    await controller.play();
    follower.dispatchEvent(new Event('waiting'));
    expect(master.paused).toBe(true);
    expect(state().paused).toBe(false);

    follower.dispatchEvent(new Event('playing'));
    await vi.advanceTimersByTimeAsync(0);
    expect(master.paused).toBe(false);
  });

  test('a rejected master play leaves the controls paused', async () => {
    const { master, controller, state } = setup();
    master.playResult = 'reject';
    await controller.play();
    expect(state().paused).toBe(true);
  });

  test('an outside pause of the master pauses the follower', async () => {
    const { master, follower, controller, state } = setup();
    await controller.play();
    master.pause();
    expect(state().paused).toBe(true);
    expect(follower.paused).toBe(true);
  });

  test('works without followers', async () => {
    const master = new FakeVideo(5);
    let state: VideoPlaybackState | undefined;
    const controller = new VideoPlaybackController((next) => (state = next));
    controller.attach(master as unknown as HTMLVideoElement);
    controller.togglePlay();
    await vi.advanceTimersByTimeAsync(0);
    expect(master.paused).toBe(false);
    master.advance(1);
    expect(state!.currentTime).toBe(1);
    controller.togglePlay();
    expect(master.paused).toBe(true);
  });
});
