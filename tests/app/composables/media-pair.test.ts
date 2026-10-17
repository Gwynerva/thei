import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRenderer,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
} from 'vue';
import type { MediaSurfaceProps } from '../../../shared/media';
import { useMediaPair } from '../../../app/composables/media-pair';
import { resetViewportObserver } from '../../../app/composables/viewport-observer';
import { useMediaInteraction } from '../../../app/composables/media-interaction';

class TestImage {
  complete = false;
  naturalWidth = 640;
  naturalHeight = 180;
  decode = vi.fn(() => Promise.resolve());
}
class TestVideo {
  readyState = 0;
  videoWidth = 640;
  videoHeight = 180;
  currentTime = 0;
  duration = 10;
  playbackRate = 1;
  paused = true;
  seeking = false;
  played = { length: 0 };
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  requestVideoFrameCallback = vi.fn((callback: (now: number) => void) => {
    videoFrames.push(callback);
    return videoFrames.length;
  });
  cancelVideoFrameCallback = vi.fn();
}
class TestContext {
  filter = 'none';
  clearRect = vi.fn();
  constructor(public drawImage: ReturnType<typeof vi.fn>) {}
}
class TestCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  constructor(public context: TestContext) {}
  getContext = () => this.context;
  animate = vi.fn(() => ({ finish: vi.fn(), cancel: vi.fn() }));
}
/** A backdrop drawn from the video: two canvases, one over the other. */
class TestBackdrop {
  clientWidth = 1024;
  clientHeight = 576;
  drawImage = vi.fn();
  canvases = [0, 1].map(() => new TestCanvas(new TestContext(this.drawImage)));
  querySelectorAll = () => this.canvases;
}
const renderer = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
});
let intersect: (entries: { isIntersecting: boolean }[]) => void;
let motionChanged: () => void;
let reduced = false;
let dispose: () => void;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let videoFrames: ((now: number) => void)[];
let now: number;

async function settle() {
  await nextTick();
  await Promise.resolve();
  for (let i = 0; i < 3; i++) {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
    await nextTick();
  }
}
function setup(overrides: Partial<MediaSurfaceProps> = {}) {
  const props = reactive<MediaSurfaceProps>({
    src: '/image',
    kind: 'image',
    backdrop: true,
    playback: 'manual',
    ...overrides,
  });
  let pair!: ReturnType<typeof useMediaPair>;
  const dimensions = vi.fn();
  const app = renderer.createApp(
    defineComponent({
      setup() {
        pair = useMediaPair(props, ref({} as HTMLElement), dimensions);
        return () => h('div');
      },
    }),
  );
  app.mount({});
  dispose = () => app.unmount();
  intersect([{ isIntersecting: true }]);
  function attach(
    role: Parameters<typeof pair.register>[0],
    element = new TestImage(),
  ) {
    pair.register(role, element as unknown as Element);
    return element;
  }
  function fire(
    role: Parameters<typeof pair.events>[0],
    name: keyof ReturnType<typeof pair.events>,
    element: TestImage | TestVideo,
  ) {
    const handlers = pair.events(role) as Record<
      string,
      (event: Event) => void
    >;
    // An event nobody listens to does nothing, as in a browser.
    handlers[name]?.({ currentTarget: element } as unknown as Event);
  }
  return { pair, props, dimensions, attach, fire };
}

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  videoFrames = [];
  now = 1000;
  reduced = false;
  vi.stubGlobal('HTMLImageElement', TestImage);
  vi.stubGlobal('HTMLVideoElement', TestVideo);
  vi.stubGlobal('HTMLElement', TestBackdrop);
  // A browser whose canvas blurs what it draws.
  vi.stubGlobal('CanvasRenderingContext2D', { prototype: { filter: 'none' } });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: () => '64px',
  }));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const query = {
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, callback: () => void) => {
      motionChanged = callback;
    },
    removeEventListener: vi.fn(),
  };
  // One observer is shared by every media on a page, so entries name their
  // target and the harness has to do the same.
  class Observer {
    targets = new Set<Element>();
    constructor(
      private callback: (
        entries: { target: Element; isIntersecting: boolean }[],
      ) => void,
    ) {
      intersect = (entries) => {
        for (const target of this.targets)
          this.callback(entries.map((entry) => ({ ...entry, target })));
      };
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  resetViewportObserver();
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('window', {
    matchMedia: () => query,
    IntersectionObserver: Observer,
  });
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  dispose?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('media pairs', () => {
  it('keeps the pulse and both originals hidden until both images decode', async () => {
    const { pair, attach, fire } = setup();
    const main = attach('main');
    const backdrop = attach('backdrop');
    fire('main', 'load', main);
    await settle();
    expect(pair.loading.value).toBe(true);
    expect(pair.revealed.value).toBe(false);
    fire('backdrop', 'load', backdrop);
    await settle();
    expect(pair.revealed.value).toBe(true);
    expect(pair.loading.value).toBe(false);
  });

  it('does not reveal a ready preview while the original is loading', async () => {
    const { pair, attach, fire } = setup({ previewSrc: '/preview' });
    for (const role of ['preview', 'previewBackdrop'] as const)
      fire(role, 'load', attach(role));
    await settle();
    expect(pair.previewRevealed.value).toBe(true);
    expect(pair.previewWanted.value).toBe(false);
    expect(pair.loading.value).toBe(true);
  });

  it('ignores decoded images belonging to an old source, including after unmount', async () => {
    const { pair, props, attach, fire, dimensions } = setup();
    let release!: () => void;
    const main = attach('main');
    main.decode.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fire('main', 'load', main);
    props.src = '/replacement';
    await settle();
    release();
    await settle();
    expect(pair.revealed.value).toBe(false);
    expect(dimensions).not.toHaveBeenCalled();
    dispose();
    expect(frames.size).toBe(0);
  });

  it('stops loading on original failure and falls back to a decoded preview pair', async () => {
    const { pair, attach, fire } = setup({ previewSrc: '/preview' });
    for (const role of ['preview', 'previewBackdrop'] as const)
      fire(role, 'load', attach(role));
    fire('main', 'error', attach('main'));
    await settle();
    expect(pair.phase.value).toBe('error');
    expect(pair.previewWanted.value && pair.previewRevealed.value).toBe(true);
    expect(pair.loading.value).toBe(false);
  });

  it('draws the backdrop of a video from its poster, then its frames, without a second video', async () => {
    const { pair, attach, fire } = setup({
      kind: 'video',
      playback: 'autoplay',
      previewSrc: '/preview',
    });
    const backdrop = new TestBackdrop();
    pair.registerFrameBackdrop(backdrop as unknown as Element);
    const [below, above] = backdrop.canvases as [TestCanvas, TestCanvas];
    // A quarter of the backdrop's size, blurred by a quarter of its blur.
    expect([below.width, below.height, above.width]).toEqual([256, 144, 256]);
    const { drawImage } = backdrop;
    const poster = attach('preview');
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    // Until its poster is in, the backdrop would show nothing.
    expect(pair.revealed.value).toBe(false);
    poster.complete = true;
    fire('preview', 'load', poster);
    await settle();
    expect(pair.revealed.value).toBe(true);
    expect(main.play).toHaveBeenCalledOnce();
    expect(below.context.filter).toBe('blur(16px)');
    expect(drawImage.mock.lastCall![0]).toBe(poster);

    // Playing, it follows the frames, up to ten times a second, each drawing
    // fading over the last until the next is due. The poster went into the
    // upper canvas, faded in; the frame goes into the lower one, uncovered.
    main.played.length = 1;
    main.currentTime = 0.5;
    fire('main', 'playing', main);
    expect(main.requestVideoFrameCallback).toHaveBeenCalledOnce();
    const drawn = drawImage.mock.calls.length;
    expect('front' in above.dataset).toBe(true);
    now += 50;
    videoFrames.shift()!(now);
    expect(drawImage).toHaveBeenCalledTimes(drawn);
    now += 60;
    videoFrames.shift()!(now);
    expect(drawImage).toHaveBeenCalledTimes(drawn + 1);
    expect(drawImage.mock.lastCall![0]).toBe(main);
    expect('front' in below.dataset && !('front' in above.dataset)).toBe(true);
    // Only the upper canvas fades; the lower one never moves.
    expect(below.animate).not.toHaveBeenCalled();
    expect(above.animate).toHaveBeenLastCalledWith(
      [{ opacity: 1 }, { opacity: 0 }],
      expect.objectContaining({ duration: 93.5, fill: 'forwards' }),
    );
    // One run of frames, however many events ask for it.
    fire('main', 'timeupdate', main);
    expect(videoFrames).toHaveLength(1);

    // Paused, it shows the very frame the video stopped at.
    main.pause();
    fire('main', 'pause', main);
    expect(main.cancelVideoFrameCallback).toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledTimes(drawn + 2);
    expect(drawImage.mock.lastCall![0]).toBe(main);
  });

  it('reveals a video without a poster once it can play, its backdrop drawn from its frame', async () => {
    const { pair } = setup({ kind: 'video', playback: 'autoplay' });
    const backdrop = new TestBackdrop();
    pair.registerFrameBackdrop(backdrop as unknown as Element);
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    expect(pair.revealed.value).toBe(true);
    expect(backdrop.drawImage.mock.lastCall![0]).toBe(main);
  });

  it('draws the backdrop of a video less often where drawing a frame is dear', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'autoplay' });
    const backdrop = new TestBackdrop();
    pair.registerFrameBackdrop(backdrop as unknown as Element);
    const { drawImage } = backdrop;
    // A canvas the processor draws: 20 ms of the main thread for every frame.
    drawImage.mockImplementation(() => {
      now += 20;
    });
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    main.played.length = 1;
    fire('main', 'playing', main);
    const tick = () => {
      now += 100;
      videoFrames.shift()!(now);
    };
    for (let i = 0; i < 30; i++) tick();
    const drawn = drawImage.mock.calls.length;
    for (let i = 0; i < 10; i++) tick();
    // Within its share of the main thread: about twice a second, not ten times.
    expect(drawImage.mock.calls.length - drawn).toBeLessThanOrEqual(3);
  });

  it('defers interaction video loading and does not play after the pointer has left', async () => {
    const { pair, props, attach, fire } = setup({
      kind: 'video',
      playback: 'interaction',
      previewSrc: '/preview',
    });
    expect(pair.requested.value).toBe(false);
    props.engaged = true;
    await settle();
    expect(pair.requested.value).toBe(true);
    props.engaged = false;
    await settle();
    const poster = attach('preview');
    poster.complete = true;
    fire('preview', 'load', poster);
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    expect(main.play).not.toHaveBeenCalled();
    props.engaged = true;
    await settle();
    fire('main', 'playing', main);
    expect(main.paused).toBe(false);
    props.engaged = false;
    await settle();
    expect(main.paused).toBe(true);
    fire('main', 'canplay', main);
    expect(main.paused).toBe(true);
  });

  it('plays a video whose poster fails, its backdrop drawn from the video', async () => {
    const { pair, attach, fire } = setup({
      kind: 'video',
      playback: 'autoplay',
      previewSrc: '/preview',
    });
    const backdrop = new TestBackdrop();
    pair.registerFrameBackdrop(backdrop as unknown as Element);
    fire('preview', 'error', attach('preview'));
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    expect(pair.phase.value).toBe('visible');
    expect(main.paused).toBe(false);
    expect(backdrop.drawImage.mock.lastCall![0]).toBe(main);
  });

  it('never pauses or restarts the main video while it is in view', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'autoplay' });
    const backdrop = new TestBackdrop();
    pair.registerFrameBackdrop(backdrop as unknown as Element);
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    fire('main', 'playing', main);

    // Buffering, a loop back to the start and its end only redraw the
    // backdrop; the video itself is the browser's.
    main.readyState = 2;
    fire('main', 'waiting', main);
    main.readyState = 4;
    fire('main', 'canplay', main);
    fire('main', 'playing', main);
    main.seeking = true;
    main.currentTime = 0;
    fire('main', 'seeking', main);
    main.seeking = false;
    fire('main', 'seeked', main);
    main.currentTime = 2.1;
    fire('main', 'timeupdate', main);
    fire('main', 'ended', main);

    expect(backdrop.drawImage).toHaveBeenCalled();
    expect(main.pause).not.toHaveBeenCalled();
    expect(main.play).toHaveBeenCalledOnce();
    expect(main.paused).toBe(false);
  });

  it('plays an autoplay video that left before it was ready once it is back', async () => {
    const { pair } = setup({
      kind: 'video',
      playback: 'autoplay',
      backdrop: false,
    });
    intersect([{ isIntersecting: false }]);
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    expect(pair.revealed.value).toBe(true);
    expect(main.play).not.toHaveBeenCalled();

    intersect([{ isIntersecting: true }]);
    await settle();
    expect(main.paused).toBe(false);
  });

  it('keeps a manually started or paused video so across viewport re-entry, and respects reduced motion', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'manual' });
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    expect(main.play).not.toHaveBeenCalled();

    // Started with its own controls.
    await main.play();
    fire('main', 'playing', main);
    main.currentTime = 2;

    // Leaving the viewport pauses it; the element stays, so nothing is
    // loaded, decoded or seeked again when it comes back.
    intersect([{ isIntersecting: false }]);
    fire('main', 'pause', main);
    await settle();
    expect(main.paused).toBe(true);

    intersect([{ isIntersecting: true }]);
    await settle();
    fire('main', 'playing', main);
    expect(main.currentTime).toBe(2);
    expect(main.paused).toBe(false);

    // Paused with its own controls, it stays paused when it comes back.
    main.pause();
    fire('main', 'pause', main);
    intersect([{ isIntersecting: false }]);
    await settle();
    intersect([{ isIntersecting: true }]);
    await settle();
    expect(main.paused).toBe(true);

    reduced = true;
    motionChanged();
    await settle();
    expect(main.paused).toBe(true);
  });

  it('can autoplay through reduced motion while still pausing outside the viewport', async () => {
    reduced = true;
    const { pair } = setup({
      kind: 'video',
      playback: 'autoplay',
      autoplayReducedMotion: true,
      backdrop: false,
    });
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    expect(main.paused).toBe(false);

    intersect([{ isIntersecting: false }]);
    await settle();
    expect(main.paused).toBe(true);
  });

  it('preserves an explicit autoplay pause across viewport re-entry', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'autoplay' });
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    fire('main', 'playing', main);
    expect(main.paused).toBe(false);

    main.pause();
    fire('main', 'pause', main);
    main.currentTime = 2;
    intersect([{ isIntersecting: false }]);
    await settle();
    intersect([{ isIntersecting: true }]);
    await settle();

    expect(main.currentTime).toBe(2);
    expect(main.paused).toBe(true);
  });

  it('pauses manually started video while its gallery layer is suspended', async () => {
    const { pair, props } = setup({
      kind: 'video',
      playback: 'manual',
      backdrop: false,
    });
    const main = new TestVideo();
    main.readyState = 4;
    pair.register('main', main as unknown as Element);
    await settle();
    await pair.play();
    expect(main.paused).toBe(false);
    props.suspended = true;
    await settle();
    expect(main.paused).toBe(true);
  });
});

it('keeps interaction active while either mouse hover or focus remains', () => {
  class TestNode {}
  vi.stubGlobal('Node', TestNode);
  const { engaged, events } = useMediaInteraction();
  events.pointerenter({ pointerType: 'touch' } as PointerEvent);
  expect(engaged.value).toBe(false);
  events.pointerenter({ pointerType: 'mouse' } as PointerEvent);
  events.focusin();
  events.pointerleave();
  expect(engaged.value).toBe(true);
  events.focusout({
    relatedTarget: new TestNode(),
    currentTarget: { contains: () => true },
  } as unknown as FocusEvent);
  expect(engaged.value).toBe(true);
  events.focusout({ relatedTarget: null } as FocusEvent);
  expect(engaged.value).toBe(false);
});
