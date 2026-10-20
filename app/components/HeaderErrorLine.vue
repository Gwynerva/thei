<script lang="ts" setup>
/**
 * The line under a form's header that says why a save failed or cannot be
 * made: under a page's sticky header (`StickyGlassHeader`'s `error`) and
 * under a modal's (`inset`). It wraps as long as its words need, a part of
 * them on a line of its own after each `\n`, the cross staying at its end;
 * closed by hand, it comes back for a new message.
 *
 * It grows into its room and gives it back as it goes, fading meanwhile,
 * so the form under the header slides rather than jumps; gone, nothing of
 * it stays in the page.
 */
const {
  message,
  inset = false,
  again,
} = defineProps<{
  message?: string;
  /** In a modal: the card's own padding instead of the page's width. */
  inset?: boolean;
  /**
   * Changes when the same message is said again — a new press of a Save
   * that still cannot save: a line closed by hand comes back for it.
   */
  again?: number;
}>();

const closed = ref(false);
watch(
  () => [message, again],
  () => {
    closed.value = false;
  },
);
const shown = computed(() => Boolean(message) && !closed.value);
/** The words stay while the line folds away, not a blank band. */
const words = ref(message);
watch(
  () => message,
  (next) => {
    if (next) words.value = next;
  },
);
</script>

<template>
  <Transition
    enter-from-class="grid-rows-[0fr] opacity-0"
    enter-active-class="transition-[grid-template-rows,opacity]
      motion-reduce:transition-none"
    enter-to-class="grid-rows-[1fr]"
    leave-from-class="grid-rows-[1fr]"
    leave-active-class="transition-[grid-template-rows,opacity]
      motion-reduce:transition-none"
    leave-to-class="grid-rows-[0fr] opacity-0"
  >
    <div v-if="shown" class="grid">
      <div class="min-h-0 overflow-hidden">
        <div
          role="alert"
          class="border-b border-border-error bg-bg-error py-xs text-sm
            text-text-error"
          data-header-error
        >
          <div
            class="flex items-start gap-xs"
            :class="
              inset
                ? 'px-sm'
                : `m-auto w-(--_width-sticky-content) max-w-full px-xs
                  sm:px-window`
            "
          >
            <Icon name="warning" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1 wrap-break-word whitespace-pre-line">{{
              words
            }}</span>
            <button
              type="button"
              class="-my-1 flex size-7 shrink-0 cursor-pointer items-center
                justify-center rounded-normal transition-colors
                pointer-coarse:-my-2 pointer-coarse:size-9
                hocus:bg-text-error/15"
              :aria-label="phrase.form_error_dismiss"
              :data-title-popup="phrase.form_error_dismiss"
              @click="closed = true"
            >
              <Icon name="plus" class="rotate-45" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
