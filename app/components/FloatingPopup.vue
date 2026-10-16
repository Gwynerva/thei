<script lang="ts" setup>
import {
  autoUpdate,
  flip,
  hide,
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
    /**
     * Where the popup is rendered. Left out, it joins the `<dialog>` its
     * anchor is in, or the body: a modal is a `<dialog>` in the top layer,
     * and a popup teleported to the body would open beneath it.
     */
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
  },
);

/** The `<dialog>` an anchor sits in, a virtual anchor through its context. */
function dialogOf(anchor: ReferenceElement | null): HTMLElement | undefined {
  if (!anchor || typeof Element === 'undefined') return undefined;
  const element =
    anchor instanceof Element ? anchor : (anchor.contextElement ?? undefined);
  return element?.closest('dialog') ?? undefined;
}

const teleportTarget = computed(
  () => props.teleportTo ?? dialogOf(props.anchor) ?? 'body',
);

/**
 * A popup opened from inside another is its child: the parent is the popup
 * its anchor stands in. Clicks in a child — a select's options, a picker —
 * are inside the parent too, though the child is not inside it in the page.
 */
const popupId = useId();
const parentPopupId = computed(() => {
  const anchor = props.anchor;
  if (!anchor || typeof Element === 'undefined') return undefined;
  const element =
    anchor instanceof Element ? anchor : (anchor.contextElement ?? undefined);
  return (
    element?.closest<HTMLElement>('[data-floating-popup]')?.dataset
      .floatingPopup || undefined
  );
});

/** Whether a node is in this popup or in one opened from it, at any depth. */
function withinFamily(target: Node) {
  const element = target instanceof Element ? target : target.parentElement;
  let popup = element?.closest<HTMLElement>('[data-floating-popup]');
  for (let depth = 0; popup && depth < 10; depth++) {
    if (popup.dataset.floatingPopup === popupId) return true;
    const parent = popup.dataset.floatingPopupParent;
    popup = parent
      ? document.querySelector<HTMLElement>(
          `[data-floating-popup="${CSS.escape(parent)}"]`,
        )
      : null;
  }
  return false;
}

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
  // An anchor scrolled out of the box it scrolls in takes its popup along,
  // rather than leave it floating over whatever is there now.
  hide({ padding: props.viewportPadding }),
]);

const { floatingStyles, middlewareData, update, isPositioned } = useFloating(
  referenceElement,
  floatingElement,
  {
    strategy: 'fixed',
    open,
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
  ...(middlewareData.value.hide?.referenceHidden
    ? { visibility: 'hidden' as const }
    : {}),
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
  if (floatingElement.value?.contains(target) || withinFamily(target)) return;
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

// Opened once drawn where it stands: until then it may still be hidden as
// its anchor was when it last closed, and nothing hidden takes the focus.
let whenPositioned: (() => void) | undefined;
watch([isPositioned, open], ([positioned, still]) => {
  if (!positioned && still) return;
  whenPositioned?.();
  whenPositioned = undefined;
});

watch(
  floatingElement,
  async (element) => {
    if (!element || !open.value) return;
    await nextTick();
    update();
    if (!isPositioned.value)
      await new Promise<void>((resolve) => (whenPositioned = resolve));
    if (!open.value || !floatingElement.value) return;
    await nextTick();
    emit('opened');
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  if (import.meta.client) removeOpenListeners();
  whenPositioned?.();
});

defineExpose({ element: floatingElement });
</script>

<template>
  <Teleport :to="teleportTarget">
    <!-- A box of its own around the popup: a teleport moved to a new target
         puts what it holds after its own end, so the popup's next sibling
         there could be the marker of a popup inside it, gone by the time the
         closed popup's placeholder is put before it. -->
    <div class="contents">
      <TransitionFade @after-leave="emit('closed')">
        <div
          v-if="open && anchor"
          ref="floating"
          v-bind="$attrs"
          :data-floating-popup="popupId"
          :data-floating-popup-parent="parentPopupId"
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
    </div>
  </Teleport>
</template>
