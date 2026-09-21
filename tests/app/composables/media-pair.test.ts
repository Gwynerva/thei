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
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
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
    handlers[name]!({ currentTarget: element } as unknown as Event);
  }
  return { pair, props, dimensions, attach, fire };
}

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  reduced = false;
  vi.stubGlobal('HTMLImageElement', TestImage);
  vi.stubGlobal('HTMLVideoElement', TestVideo);
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

  it('starts both videos only when both are ready', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'autoplay' });
    const main = new TestVideo();
    const backdrop = new TestVideo();
    pair.register('main', main as unknown as Element);
    pair.register('backdrop', backdrop as unknown as Element);
    main.readyState = 4;
    fire('main', 'loadeddata', main);
    await settle();
    expect(main.play).not.toHaveBeenCalled();
    backdrop.readyState = 4;
    fire('backdrop', 'loadeddata', backdrop);
    await settle();
    expect(main.play).toHaveBeenCalledOnce();
    expect(backdrop.play).toHaveBeenCalledOnce();
    expect(pair.revealed.value).toBe(true);
  });

  it('defers interaction video loading and does not play after the pointer has left', async () => {
    const { pair, props, fire } = setup({
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
    const main = new TestVideo();
    const backdrop = new TestVideo();
    main.readyState = backdrop.readyState = 4;
    pair.register('main', main as unknown as Element);
    pair.register('backdrop', backdrop as unknown as Element);
    await settle();
    expect(main.play).not.toHaveBeenCalled();
    expect(backdrop.play).not.toHaveBeenCalled();
    props.engaged = true;
    await settle();
    expect(main.paused || backdrop.paused).toBe(false);
    props.engaged = false;
    await settle();
    expect(main.paused && backdrop.paused).toBe(true);
    fire('main', 'canplay', main);
    expect(main.paused).toBe(true);
  });

  it('keeps the main video usable when only its backdrop fails', async () => {
    const { pair, attach, fire } = setup({
      kind: 'video',
      playback: 'autoplay',
      previewSrc: '/preview',
    });
    for (const role of ['preview', 'previewBackdrop'] as const)
      fire(role, 'load', attach(role));
    const main = new TestVideo();
    main.readyState = 4;
    const backdrop = new TestVideo();
    pair.register('main', main as unknown as Element);
    pair.register('backdrop', backdrop as unknown as Element);
    fire('backdrop', 'error', backdrop);
    await settle();
    expect(pair.phase.value).toBe('visible');
    expect(main.paused).toBe(false);
    expect(pair.status.previewBackdrop).toBe('ready');
  });

  it('pauses both layers for buffering and resumes only after both can play', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'autoplay' });
    const main = new TestVideo();
    const backdrop = new TestVideo();
    main.readyState = backdrop.readyState = 4;
    pair.register('main', main as unknown as Element);
    pair.register('backdrop', backdrop as unknown as Element);
    await settle();
    backdrop.readyState = 2;
    fire('backdrop', 'waiting', backdrop);
    fire('main', 'pause', main);
    fire('main', 'canplay', main);
    expect(main.paused && backdrop.paused).toBe(true);
    backdrop.readyState = 4;
    fire('backdrop', 'canplay', backdrop);
    await settle();
    expect(main.paused || backdrop.paused).toBe(false);
  });

  it('keeps a manually started video where it was across viewport re-entry, and respects reduced motion', async () => {
    const { pair, fire } = setup({ kind: 'video', playback: 'manual' });
    const main = new TestVideo();
    const backdrop = new TestVideo();
    main.readyState = backdrop.readyState = 4;
    pair.register('main', main as unknown as Element);
    pair.register('backdrop', backdrop as unknown as Element);
    await settle();
    await pair.play();
    main.currentTime = backdrop.currentTime = 2;

    // Leaving the viewport pauses the pair; the elements stay, so nothing is
    // loaded, decoded or seeked again when it comes back.
    intersect([{ isIntersecting: false }]);
    fire('main', 'pause', main);
    await settle();
    expect(main.paused && backdrop.paused).toBe(true);

    intersect([{ isIntersecting: true }]);
    await settle();
    expect(main.currentTime).toBe(2);
    expect(main.paused || backdrop.paused).toBe(false);

    await pair.pause();
    expect(main.paused && backdrop.paused).toBe(true);
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
    const backdrop = new TestVideo();
    main.readyState = backdrop.readyState = 4;
    pair.register('main', main as unknown as Element);
    pair.register('backdrop', backdrop as unknown as Element);
    await settle();
    expect(main.paused || backdrop.paused).toBe(false);

    main.pause();
    fire('main', 'pause', main);
    main.currentTime = backdrop.currentTime = 2;
    intersect([{ isIntersecting: false }]);
    await settle();
    intersect([{ isIntersecting: true }]);
    await settle();

    expect(main.currentTime).toBe(2);
    expect(main.paused && backdrop.paused).toBe(true);
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
