<script lang="ts" setup>
import {
  autoUpdate,
  flip,
  offset as floatingOffset,
  shift,
  size,
  useFloating,
  type Placement,
  type ReferenceElement,
} from '@floating-ui/vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    anchor: ReferenceElement | null;
    placement?: Placement;
    fallbackPlacements?: Placement[];
    shiftCrossAxis?: boolean;
    offset?: number;
    viewportPadding?: number;
    maxWidth?: string;
    closeOnOutside?: boolean;
    closeOnEscape?: boolean;
    outsideIgnore?: Array<HTMLElement | null>;
    teleportTo?: string | HTMLElement;
    fitContent?: boolean;
  }>(),
  {
    placement: 'bottom-end',
    shiftCrossAxis: false,
    offset: 8,
    viewportPadding: 8,
    maxWidth: '20rem',
    closeOnOutside: true,
    closeOnEscape: true,
    teleportTo: 'body',
  },
);

const emit = defineEmits<{
  opened: [];
  closed: [];
  /**
   * The popup is being closed without a choice made in it: by a click or tap
   * outside, or by Escape. Sent at once, before the outside click goes on to
   * wherever it was aimed, so an owner can hand back a text selection it had
   * borrowed while it still holds it.
   */
  dismiss: [reason: 'outside' | 'escape'];
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
  shift({
    padding: props.viewportPadding,
    crossAxis: props.shiftCrossAxis,
  }),
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
  if (props.anchor instanceof Node && props.anchor.contains(target)) return;
  if (props.outsideIgnore?.some((element) => element?.contains(target))) return;
  emit('dismiss', 'outside');
  close();
}

// Escape is not handled here. An open popup registers itself as a dismissible
// layer instead, so that Escape and browser Back undo the same one step and
// agree on which step that is — the popup first, the modal underneath after.
let removeDismissLayer: (() => void) | undefined;

function dismissByEscape() {
  emit('dismiss', 'escape');
  close();
}

function addOpenListeners() {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  if (props.closeOnEscape)
    removeDismissLayer = registerDismissLayer(dismissByEscape);
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate);
}

function removeOpenListeners() {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  removeDismissLayer?.();
  removeDismissLayer = undefined;
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
  <Teleport :to="teleportTo">
    <TransitionFade @after-leave="emit('closed')">
      <div
        v-if="open && anchor"
        ref="floating"
        v-bind="$attrs"
        :style="popupStyle"
        class="fixed z-9998 max-h-(--floating-popup-available-height)
          max-w-[calc(100dvw-var(--spacing-window)-var(--spacing-window))]
          overflow-hidden rounded-normal shadow-xl shadow-shadow-3"
        :class="
          fitContent
            ? 'w-fit'
            : 'w-[min(var(--floating-popup-max-width),var(--floating-popup-available-width))]'
        "
      >
        <slot></slot>
      </div>
    </TransitionFade>
  </Teleport>
</template>
