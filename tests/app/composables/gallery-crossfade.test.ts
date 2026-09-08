import { createRenderer, defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGalleryCrossfade } from '../../../app/composables/gallery-crossfade';

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

type Item = { id: string };
let dispose: (() => void) | undefined;

function setup() {
  const selected = ref<Item>({ id: 'first' });
  let crossfade!: ReturnType<typeof useGalleryCrossfade<Item>>;
  const app = renderer.createApp(
    defineComponent({
      setup() {
        crossfade = useGalleryCrossfade(selected, (item) => item.id);
        return () => h('div');
      },
    }),
  );
  app.mount({});
  dispose = () => app.unmount();
  return { selected, crossfade };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  dispose?.();
  vi.useRealTimers();
});

describe('gallery crossfade', () => {
  it('keeps the displayed item until the replacement is ready and faded in', async () => {
    const { selected, crossfade } = setup();
    selected.value = { id: 'second' };
    await nextTick();
    expect(crossfade.displayed.value?.id).toBe('first');
    expect(crossfade.incoming.value?.id).toBe('second');
    expect(crossfade.revealing.value).toBe(false);

    crossfade.settleIncoming('second');
    expect(crossfade.revealing.value).toBe(true);
    vi.advanceTimersByTime(300);
    expect(crossfade.displayed.value?.id).toBe('second');
    expect(crossfade.incoming.value).toBeUndefined();
  });

  it('ignores stale readiness and finishes on the latest rapid selection', async () => {
    const { selected, crossfade } = setup();
    selected.value = { id: 'second' };
    await nextTick();
    crossfade.settleIncoming('second');
    selected.value = { id: 'third' };
    await nextTick();
    crossfade.settleIncoming('second');
    vi.advanceTimersByTime(300);
    expect(crossfade.displayed.value?.id).toBe('first');
    expect(crossfade.incoming.value?.id).toBe('third');

    crossfade.settleIncoming('third');
    vi.advanceTimersByTime(300);
    expect(crossfade.displayed.value?.id).toBe('third');
  });
});
