<script lang="ts" setup>
/**
 * The wait inside a modal: the `loading` icon, shown only once a transition's
 * length has passed, so that a quick open never flashes it.
 */
</script>

<template>
  <span
    role="status"
    :aria-label="phrase.modal_waiting"
    class="modal-waiting flex items-center justify-center text-2xl text-text-3"
  >
    <Icon name="loading" />
  </span>
</template>

<style scoped>
.modal-waiting {
  opacity: 0;
  animation: modal-waiting-in var(--default-transition-duration)
    var(--default-transition-timing-function) var(--default-transition-duration)
    forwards;
}

@keyframes modal-waiting-in {
  to {
    opacity: 1;
  }
}

/* It still waits before it shows; it only appears without fading. */
@media (prefers-reduced-motion: reduce) {
  .modal-waiting {
    animation-duration: 0s;
  }
}
</style>
