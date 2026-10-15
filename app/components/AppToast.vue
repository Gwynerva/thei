<script lang="ts" setup>
/**
 * The page's one toast, just under the admin bar over everything — an open
 * dialog included, as a popover lives in the top layer. Not at the foot of
 * the window, where it would cover what one writes in: the composer of a
 * session, a form's last field. It goes by itself; one with an action waits
 * longer, and hovering or focusing it holds it.
 */
const toast = useToast();
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

watch(toast, async (value) => {
  leaving.value = false;
  await nextTick();
  const popover = element.value;
  if (!popover) return;
  if (value) {
    if (!popover.matches(':popover-open')) popover.showPopover();
    schedule();
  } else if (popover.matches(':popover-open')) popover.hidePopover();
});

function hold(on: boolean) {
  held = on;
  if (on && timer) clearTimeout(timer);
  else schedule();
}

async function act() {
  const action = toast.value?.action;
  toast.value = null;
  await action?.run();
}

onBeforeUnmount(() => timer && clearTimeout(timer));
</script>

<template>
  <div
    ref="element"
    popover="manual"
    role="status"
    class="toast fixed inset-x-0 top-0 bottom-auto m-0 mx-auto
      mt-[calc(var(--height-admin-bar)+var(--spacing-sm))] w-fit
      max-w-[calc(100vw-2rem)] items-center justify-center gap-x-md gap-y-1
      rounded-normal border-0 bg-text-1 px-md py-sm text-sm text-bg-1 shadow-lg
      shadow-shadow-2 transition-opacity"
    :class="leaving ? 'opacity-0' : 'opacity-100'"
    data-toast
    @mouseenter="hold(true)"
    @mouseleave="hold(false)"
    @focusin="hold(true)"
    @focusout="hold(false)"
  >
    <template v-if="toast">
      <span>{{ toast.text }}</span>
      <button
        v-if="toast.action"
        type="button"
        class="-my-2 cursor-pointer bg-transparent px-1 py-2 font-bold
          whitespace-nowrap text-bg-accent pointer-coarse:min-h-11"
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
