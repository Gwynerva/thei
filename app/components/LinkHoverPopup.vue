<script lang="ts" setup>
import {
  usePressHints,
  type PressHintProvider,
} from '#layers/thei/app/composables/press-hint-dom';

/**
 * The card of a link: the popup of the links in a text, and of the chips that
 * stand for links elsewhere, such as the profile's. One popup serves every
 * link `selector` finds inside `root`; what it shows of the link under it is
 * the slot's to draw.
 *
 * It opens as a title popup does (`press-hint.ts`): while the pointer rests
 * on a link, when the keyboard reaches one, and on a first long press of a
 * finger — a tap follows the link, and a second long press brings the
 * system's own menu of it. The card is below a pointer and above a finger.
 */
const props = defineProps<{
  root: HTMLElement | null;
  selector: string;
}>();
const emit = defineEmits<{
  /** A link was pointed at, reached with the keyboard or held. */
  show: [anchor: HTMLElement];
  /** The card was put away. */
  hide: [];
}>();
defineSlots<{ default(props: { anchor: HTMLElement }): unknown }>();

const open = ref(false);
const anchor = ref<HTMLElement | null>(null);
const placement = ref<'bottom-start' | 'top-start'>('bottom-start');
const popup = useTemplateRef<{ element: HTMLElement | null }>('popup');
const teleportTarget = computed(() => props.root?.closest('dialog') ?? 'body');
const id = useId();

const provider: PressHintProvider = {
  id: `link-card:${id}`,
  anchorFor(target) {
    const root = props.root;
    if (!root?.contains(target)) return null;
    const link = target.closest<HTMLElement>(props.selector);
    return link && root.contains(link) ? link : null;
  },
  hasHint: () => true,
  show(link, how) {
    anchor.value = link;
    placement.value = how.placement === 'top' ? 'top-start' : 'bottom-start';
    open.value = true;
    emit('show', link);
  },
  hide() {
    open.value = false;
    anchor.value = null;
    emit('hide');
  },
  owns: (node) => Boolean(popup.value?.element?.contains(node)),
  delays: { hover: 350, focus: 0 },
};

/** Marks the root for `main.css`: its links keep a first long press. */
const ROOT_ATTRIBUTE = 'data-link-card-root';
watch(
  () => props.root,
  (next, previous) => {
    previous?.removeAttribute(ROOT_ATTRIBUTE);
    next?.setAttribute(ROOT_ATTRIBUTE, '');
  },
  { immediate: true, flush: 'post' },
);

let unregister: (() => void) | undefined;
onMounted(() => {
  unregister = usePressHints()?.register(provider);
});
onBeforeUnmount(() => {
  unregister?.();
  props.root?.removeAttribute(ROOT_ATTRIBUTE);
});
</script>

<template>
  <!-- Closing is the hints' to decide, the outside touch and Escape too. -->
  <FloatingPopup
    ref="popup"
    v-model:open="open"
    :anchor="anchor"
    :placement
    max-width="22rem"
    :teleport-to="teleportTarget"
    :close-on-outside="false"
    :close-on-escape="false"
    class="border border-border-1 bg-bg-2"
  >
    <slot v-if="anchor" :anchor="anchor" />
  </FloatingPopup>
</template>
