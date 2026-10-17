<script lang="ts" setup>
import type { Placement, ReferenceElement } from '@floating-ui/vue';
import {
  POPUP_ARROW_CLASS,
  POPUP_ARROW_EDGES,
  POPUP_ARROW_SIZE,
  POPUP_GAP,
  POPUP_VIEWPORT_PADDING,
  POPUP_ARROW_TIP,
  usePopupPlacement,
} from '#layers/thei/app/composables/popup-placement';

defineOptions({ inheritAttrs: false });

/**
 * The one popup of the site: a surface by its anchor, with an arrow at it,
 * growing from that arrow as it opens and back into it as it closes. Its
 * anchor shows it is open (`data-popup-open`) for as long as it is. On a
 * phone a `complex` popup — a form, a search, levels to go down — comes up
 * from the bottom as a sheet instead; small, quick ones stay by their
 * anchor everywhere.
 *
 * It draws the surface itself; what it holds draws none of its own. Its
 * `density` gives what it holds the room around it, one of three: `compact`
 * for rows of icons, `list` for menus, lists and pickers, `card` for text
 * and forms — and scrolls it when the window is too short for it. `none`
 * leaves the room to a content that scrolls inside itself and keeps its own.
 *
 * It is rendered in the `<dialog>` its anchor is in, or the body: a modal
 * is a `<dialog>` in the top layer, and a popup in the body would open
 * beneath it.
 */
const props = withDefaults(
  defineProps<{
    anchor: ReferenceElement | null;
    placement?: Placement;
    fallbackPlacements?: Placement[];
    shiftCrossAxis?: boolean;
    maxWidth?: string;
    closeOnOutside?: boolean;
    closeOnEscape?: boolean;
    fitContent?: boolean;
    density?: 'none' | 'compact' | 'list' | 'card';
    arrow?: boolean;
    /** A form, a search or levels to go down: a sheet on a phone. */
    complex?: boolean;
  }>(),
  {
    placement: 'bottom-end',
    shiftCrossAxis: false,
    maxWidth: '20rem',
    closeOnOutside: true,
    closeOnEscape: true,
    density: 'none',
    arrow: true,
  },
);

const DENSITY = {
  none: '',
  compact: 'p-1.5',
  list: 'p-xs',
  card: 'p-sm',
} as const;

/** The element an anchor stands for: itself, or a virtual one's context. */
function elementOf(anchor: ReferenceElement | null): Element | undefined {
  if (!anchor || typeof Element === 'undefined') return undefined;
  return anchor instanceof Element
    ? anchor
    : (anchor.contextElement ?? undefined);
}

/**
 * The `<dialog>` the anchor is in, else the body — kept while the anchor
 * is taken away, so a closing popup is not moved under a modal.
 */
let lastTarget: Element | 'body' = 'body';
const teleportTarget = computed(() => {
  const element = elementOf(props.anchor);
  if (element) lastTarget = element.closest('dialog') ?? 'body';
  return lastTarget;
});

/**
 * A popup opened from inside another is its child: the parent is the popup
 * its anchor stands in. Clicks in a child — a select's options, a picker —
 * are inside the parent too, though the child is not inside it in the page.
 */
const popupId = useId();
const parentPopupId = computed(
  () =>
    elementOf(props.anchor)?.closest<HTMLElement>('[data-floating-popup]')
      ?.dataset.floatingPopup || undefined,
);

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
const arrowElement = useTemplateRef<HTMLElement>('arrowElement');

const phone = usePhoneWidth();
const sheet = computed(() => props.complex && phone.value);

const {
  floatingStyles,
  side,
  hidden,
  arrowStyle,
  origin,
  isPositioned,
  update,
} = usePopupPlacement(
  computed(() => (sheet.value ? null : props.anchor)),
  floatingElement,
  arrowElement,
  {
    open,
    placement: () => props.placement,
    fallbackPlacements: () => props.fallbackPlacements,
    gap: () => POPUP_GAP,
    padding: () => POPUP_VIEWPORT_PADDING,
    shiftCrossAxis: () => props.shiftCrossAxis,
    arrowSize: () => (props.arrow ? POPUP_ARROW_SIZE.popup : undefined),
    onRoom: (room, element) => {
      element.style.setProperty(
        '--floating-popup-available-height',
        `${room.height}px`,
      );
      element.style.setProperty(
        '--floating-popup-available-width',
        // No wider than the popup may be, kept off the window's sides.
        `min(${room.width}px, 100dvw - 2 * var(--spacing-window))`,
      );
      // For what is to be as wide as its anchor: a list under its field.
      element.style.setProperty(
        '--floating-popup-anchor-width',
        `${room.anchorWidth}px`,
      );
    },
  },
);

const popupStyle = computed(() =>
  sheet.value
    ? {
        // What a sheet holds may take most of the screen, under the top.
        '--floating-popup-available-height': 'calc(85dvh - 2rem)',
        '--floating-popup-available-width': '100dvw',
      }
    : {
        ...floatingStyles.value,
        '--floating-popup-max-width': props.maxWidth,
        transformOrigin: origin.value,
        // Unseen until placed: drawn first at the window's corner, it could
        // come up under the pointer and take the hover from its own anchor.
        ...(hidden.value || !isPositioned.value
          ? { visibility: 'hidden' as const }
          : {}),
      },
);

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
  noteClosingPress(event);
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

/** The anchor says which popup of it is open, for its own look of it. */
let marked: Element | undefined;
function markAnchor(element: Element | undefined) {
  if (marked === element) return;
  // Another popup of the same anchor may have marked it since: its mark stays.
  if (marked?.getAttribute('data-popup-open') === popupId)
    marked.removeAttribute('data-popup-open');
  marked = element;
  marked?.setAttribute('data-popup-open', popupId);
}
// Not an anchor in a text being edited, such as a link the pointer rests on:
// a change of it would be a change of the text.
watch(
  () =>
    open.value &&
    typeof Element !== 'undefined' &&
    props.anchor instanceof Element &&
    !(props.anchor instanceof HTMLElement && props.anchor.isContentEditable)
      ? props.anchor
      : undefined,
  markAnchor,
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
    if (!sheet.value) {
      update();
      if (!isPositioned.value)
        await new Promise<void>((resolve) => (whenPositioned = resolve));
    }
    if (!open.value || !floatingElement.value) return;
    await nextTick();
    emit('opened');
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  if (import.meta.client) removeOpenListeners();
  whenPositioned?.();
  markAnchor(undefined);
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
      <Transition
        appear
        enter-from-class="opacity-0"
        enter-active-class="transition-opacity motion-reduce:duration-0"
        leave-to-class="opacity-0"
        leave-active-class="transition-opacity motion-reduce:duration-0"
      >
        <div
          v-if="open && sheet"
          class="fixed inset-0 z-9998 bg-black/40"
          aria-hidden="true"
          data-popup-scrim
        ></div>
      </Transition>
      <!-- Mounted open, it still grows in. -->
      <Transition
        appear
        :enter-from-class="
          sheet
            ? 'translate-y-full motion-reduce:translate-y-0 opacity-0'
            : 'scale-95 opacity-0 motion-reduce:scale-100'
        "
        enter-active-class="transition-[opacity,scale,translate] motion-reduce:duration-0"
        :leave-to-class="
          sheet
            ? 'translate-y-full motion-reduce:translate-y-0 opacity-0'
            : 'scale-95 opacity-0 motion-reduce:scale-100'
        "
        leave-active-class="transition-[opacity,scale,translate] motion-reduce:duration-0"
        @after-leave="emit('closed')"
      >
        <div
          v-if="open && (anchor || sheet)"
          ref="floating"
          v-bind="$attrs"
          :data-floating-popup="popupId"
          :data-floating-popup-parent="parentPopupId"
          :data-popup-side="sheet ? 'sheet' : side"
          :style="popupStyle"
          class="z-9998 border-border-1 bg-bg-2 text-text-1 shadow-popup"
          :class="
            sheet
              ? `fixed inset-x-0 bottom-0 rounded-t-normal border-t
                pb-[env(safe-area-inset-bottom)]`
              : [
                  'fixed rounded-normal border',
                  'max-w-[calc(100dvw-var(--spacing-window)-var(--spacing-window))]',
                  fitContent
                    ? 'w-fit'
                    : 'w-[min(var(--floating-popup-max-width),var(--floating-popup-available-width))]',
                ]
          "
        >
          <div
            v-if="sheet"
            class="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-border-2"
            aria-hidden="true"
          ></div>
          <!-- The room the popup has is what it holds may take; a block, so
               a content of a fixed width centres in a sheet and any other
               stretches. With room of its own around what it holds, the
               popup scrolls it when the window is short; a content that
               scrolls inside itself keeps its own room and its scroll. -->
          <div
            class="max-h-(--floating-popup-available-height) rounded-[inherit]"
            :class="[
              DENSITY[density],
              sheet && '*:mx-auto',
              density === 'none'
                ? 'overflow-hidden'
                : `scrollbar-hover overflow-x-hidden overflow-y-auto
                  overscroll-contain`,
            ]"
          >
            <slot></slot>
          </div>
          <span
            v-if="props.arrow && !sheet"
            ref="arrowElement"
            :class="[
              POPUP_ARROW_CLASS,
              POPUP_ARROW_EDGES[side],
              POPUP_ARROW_TIP[side],
            ]"
            :style="arrowStyle"
            aria-hidden="true"
            data-popup-arrow
          ></span>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
