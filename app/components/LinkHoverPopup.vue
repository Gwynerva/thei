<script lang="ts" setup>
/**
 * The card of a link, shown under it while the pointer rests on it or the
 * keyboard is on it: the popup of the links in a text, and of the chips that
 * stand for links elsewhere, such as the profile's. One popup serves every
 * link `selector` finds inside `root`; what it shows of the link under it is
 * the slot's to draw.
 */
const props = defineProps<{
  root: HTMLElement | null;
  selector: string;
}>();
const emit = defineEmits<{
  /** A link was pointed at, or reached with the keyboard. */
  show: [anchor: HTMLElement];
  /** The pointer left the link it was shown for. */
  hide: [];
}>();
defineSlots<{ default(props: { anchor: HTMLElement }): unknown }>();

const HOVER_OPEN_DELAY = 350;

const open = ref(false);
const anchor = ref<HTMLElement | null>(null);
const teleportTarget = computed(() => props.root?.closest('dialog') ?? 'body');
let showTimer: ReturnType<typeof setTimeout> | undefined;

function show(link: HTMLElement) {
  anchor.value = link;
  open.value = true;
  emit('show', link);
}

function linkFromEvent(event: Event) {
  const link = (event.target as Element | null)?.closest<HTMLElement>(
    props.selector,
  );
  return link && props.root?.contains(link) ? link : undefined;
}

function onPointerOver(event: Event) {
  const link = linkFromEvent(event);
  if (!link || link === anchor.value) return;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => show(link), HOVER_OPEN_DELAY);
}

function onPointerOut(event: PointerEvent) {
  const link = linkFromEvent(event);
  if (!link) return;
  if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget))
    return;
  clearTimeout(showTimer);
  open.value = false;
  anchor.value = null;
  emit('hide');
}

function onFocusIn(event: Event) {
  const link = linkFromEvent(event);
  if (link) show(link);
}

function listen(root: HTMLElement | null | undefined, on: boolean) {
  const method = on ? 'addEventListener' : 'removeEventListener';
  root?.[method]('pointerover', onPointerOver);
  root?.[method]('pointerout', onPointerOut as EventListener);
  root?.[method]('focusin', onFocusIn);
}

watch(
  () => props.root,
  (next, previous) => {
    listen(previous, false);
    listen(next, true);
  },
  { immediate: true, flush: 'post' },
);

onBeforeUnmount(() => {
  listen(props.root, false);
  clearTimeout(showTimer);
});
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="anchor"
    placement="bottom-start"
    max-width="22rem"
    :teleport-to="teleportTarget"
    class="border border-border-1 bg-bg-2"
  >
    <slot v-if="anchor" :anchor="anchor" />
  </FloatingPopup>
</template>
