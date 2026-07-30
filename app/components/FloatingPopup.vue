<script lang="ts" setup>
import {
  autoUpdate,
  flip,
  offset as floatingOffset,
  shift,
  size,
  useFloating,
  type Placement,
} from '@floating-ui/vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    anchor: HTMLElement | null;
    placement?: Placement;
    fallbackPlacements?: Placement[];
    offset?: number;
    viewportPadding?: number;
    maxWidth?: string;
    closeOnOutside?: boolean;
    closeOnEscape?: boolean;
  }>(),
  {
    placement: 'bottom-end',
    offset: 8,
    viewportPadding: 8,
    maxWidth: '20rem',
    closeOnOutside: true,
    closeOnEscape: true,
  },
);

const emit = defineEmits<{
  opened: [];
  closed: [];
}>();

const open = defineModel<boolean>('open', { required: true });
const floatingElement = useTemplateRef<HTMLElement>('floating');
const referenceElement = computed(() => props.anchor);

const middleware = computed(() => [
  floatingOffset(props.offset),
  flip({
    padding: props.viewportPadding,
    fallbackPlacements: props.fallbackPlacements,
  }),
  shift({ padding: props.viewportPadding }),
  size({
    padding: props.viewportPadding,
    apply({ availableHeight, availableWidth, elements }) {
      elements.floating.style.setProperty(
        '--floating-popup-available-height',
        `${Math.max(0, availableHeight)}px`,
      );
      elements.floating.style.setProperty(
        '--floating-popup-available-width',
        `${Math.max(0, availableWidth)}px`,
      );
    },
  }),
]);

const { floatingStyles, update } = useFloating(
  referenceElement,
  floatingElement,
  {
    strategy: 'fixed',
    placement: computed(() => props.placement),
    middleware,
    whileElementsMounted(reference, floating, performUpdate) {
      return autoUpdate(reference, floating, performUpdate, {
        animationFrame: false,
      });
    },
  },
);

const popupStyle = computed(() => ({
  ...floatingStyles.value,
  '--floating-popup-max-width': props.maxWidth,
}));

let viewportFrame: number | undefined;

function scheduleViewportUpdate() {
  if (viewportFrame !== undefined) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = undefined;
    void update();
  });
}

function cancelViewportUpdate() {
  if (viewportFrame === undefined) return;
  cancelAnimationFrame(viewportFrame);
  viewportFrame = undefined;
}

function close() {
  open.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!props.closeOnOutside) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (floatingElement.value?.contains(target)) return;
  if (props.anchor?.contains(target)) return;
  close();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (props.closeOnEscape && event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

function addOpenListeners() {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeydown);
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate);
}

function removeOpenListeners() {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeydown);
  window.visualViewport?.removeEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.removeEventListener('scroll', scheduleViewportUpdate);
  cancelViewportUpdate();
}

watch(
  open,
  (isOpen) => {
    if (!import.meta.client) return;
    removeOpenListeners();
    if (isOpen) addOpenListeners();
  },
  { immediate: true },
);

watch(
  floatingElement,
  async (element) => {
    if (!element || !open.value) return;
    await nextTick();
    await update();
    emit('opened');
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  if (import.meta.client) removeOpenListeners();
});
</script>

<template>
  <Teleport to="body">
    <TransitionFade @after-leave="emit('closed')">
      <div
        v-if="open && anchor"
        ref="floating"
        v-bind="$attrs"
        :style="popupStyle"
        class="fixed z-9998 max-h-(--floating-popup-available-height)
          w-[min(var(--floating-popup-max-width),var(--floating-popup-available-width))]
          max-w-[calc(100dvw-var(--spacing-window)-var(--spacing-window))]
          overflow-hidden rounded-normal shadow-xl shadow-shadow-3"
      >
        <slot></slot>
      </div>
    </TransitionFade>
  </Teleport>
</template>
