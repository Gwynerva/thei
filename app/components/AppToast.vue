<script lang="ts" setup>
/**
 * The page's one toast, just under the admin bar and the page's sticky header
 * — so never over a form's own «Save» — over everything else, an open dialog
 * included, as a popover lives in the top layer. Not at the foot of the
 * window, where it would cover what one writes in: the composer of a
 * session, a form's last field. It goes by itself; one with an action waits
 * longer, and a mouse resting on it or the focus in it holds it. A press
 * anywhere else takes it away: the owner has gone on, and it would only lie
 * over what they reach for next.
 */
const toast = useToast();
const stickyHeader = useStickyHeaderContext();
const top = computed(
  () =>
    `calc(var(--height-admin-bar) + ${stickyHeader?.height.value ?? 0}px + var(--spacing-sm))`,
);
const element = ref<HTMLElement>();
const leaving = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let held = false;

function hide() {
  leaving.value = true;
  timer = setTimeout(() => {
    toast.value = null;
    leaving.value = false;
  }, 300);
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (!toast.value || held) return;
  timer = setTimeout(hide, toast.value.action ? TOAST_ACTION_MS : TOAST_MS);
}

/**
 * A toast speaks of the page it was said on: gone to another page, it goes
 * too, rather than cover the next page's top with a word about the last.
 */
const route = useRoute();
let saidOn = route.path;
watch(
  () => route.path,
  (path) => {
    if (toast.value && path !== saidOn && !leaving.value) {
      if (timer) clearTimeout(timer);
      hide();
    }
  },
);

watch(toast, async (value) => {
  leaving.value = false;
  saidOn = route.path;
  await nextTick();
  const popover = element.value;
  if (!popover) return;
  if (value) {
    if (!popover.matches(':popover-open')) popover.showPopover();
    schedule();
  } else if (popover.matches(':popover-open')) popover.hidePopover();
});

/**
 * Pointed at or focused, it stays. Once it is fading out it is no longer
 * held: nothing would ever take it away, and it would stay in the top layer
 * unseen, catching the pointer.
 */
function hold(on: boolean) {
  held = on;
  if (leaving.value) return;
  if (on && timer) clearTimeout(timer);
  else schedule();
}

async function act() {
  const action = toast.value?.action;
  toast.value = null;
  await action?.run();
}

/**
 * Only a mouse or a pen rests on it: a finger lifted where the toast then
 * appears leaves a hover behind it that no finger ever takes away.
 */
function point(event: PointerEvent, on: boolean) {
  if (event.pointerType === 'mouse' || event.pointerType === 'pen') hold(on);
}

/** A press elsewhere: what it says is behind the owner now. */
function pressed(event: PointerEvent) {
  if (!toast.value || leaving.value) return;
  if (element.value?.contains(event.target as Node)) return;
  if (timer) clearTimeout(timer);
  held = false;
  hide();
}
onMounted(() => document.addEventListener('pointerdown', pressed, true));
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', pressed, true);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div
    ref="element"
    popover="manual"
    role="status"
    class="toast fixed inset-x-0 top-0 bottom-auto m-0 mx-auto w-fit
      max-w-[calc(100vw-2rem)] items-center justify-center gap-x-md gap-y-1
      rounded-normal border-0 bg-text-1 px-md py-sm text-sm text-bg-1 shadow-lg
      shadow-shadow-2 transition-opacity"
    :class="leaving ? 'pointer-events-none opacity-0' : 'opacity-100'"
    :style="{ marginTop: top }"
    data-toast
    @pointerenter="point($event, true)"
    @pointerleave="point($event, false)"
    @focusin="hold(true)"
    @focusout="hold(false)"
  >
    <template v-if="toast">
      <span>{{ toast.text }}</span>
      <button
        v-if="toast.action"
        type="button"
        class="-my-2 cursor-pointer rounded-sm bg-transparent px-1 py-2
          font-bold whitespace-nowrap text-bg-accent transition
          focus-visible:ring-2 focus-visible:ring-bg-accent
          pointer-coarse:min-h-11 hocus:underline"
        @click="act"
      >
        {{ toast.action.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.toast:popover-open {
  display: flex;
  flex-wrap: wrap;
}
</style>
