import type { InjectionKey, Ref } from 'vue';

interface StickyHeaderContext {
  height: Readonly<Ref<number>>;
  register: (element: HTMLElement) => () => void;
  /**
   * Whether a second sticky bar below the header is currently stuck.
   *
   * Two stacked bars each casting a shadow read as a seam across the page, so
   * the lower one takes the shadow over while it is stuck.
   */
  secondaryStuck: Readonly<Ref<boolean>>;
  setSecondaryStuck: (value: boolean) => void;
}

const stickyHeaderContextKey: InjectionKey<StickyHeaderContext> = Symbol(
  'thei-sticky-header-context',
);

export function provideStickyHeaderContext() {
  const activeElement = shallowRef<HTMLElement>();
  const height = ref(0);
  const secondaryStuck = ref(false);
  let resizeObserver: ResizeObserver | undefined;

  function updateHeight() {
    height.value = activeElement.value?.getBoundingClientRect().height ?? 0;
  }

  function register(element: HTMLElement) {
    resizeObserver?.disconnect();
    activeElement.value = element;
    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(element);
    }

    return () => {
      if (activeElement.value !== element) return;
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      activeElement.value = undefined;
      height.value = 0;
    };
  }

  const context: StickyHeaderContext = {
    height: readonly(height),
    register,
    secondaryStuck: readonly(secondaryStuck),
    setSecondaryStuck: (value: boolean) => {
      secondaryStuck.value = value;
    },
  };
  provide(stickyHeaderContextKey, context);
  return context;
}

export function useStickyHeaderContext() {
  return inject(stickyHeaderContextKey, undefined);
}
