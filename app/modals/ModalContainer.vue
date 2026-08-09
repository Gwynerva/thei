<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

function overlayClick() {
  closeModal();
}
</script>

<template>
  <section
    class="absolute inset-0 sm:flex sm:items-center sm:justify-center sm:py-10"
  >
    <!-- Overlay -->
    <div
      @click="overlayClick"
      class="absolute inset-0 bg-bg-2 max-sm:pointer-events-none sm:bg-bg-1/40
        sm:backdrop-blur-md dark:sm:bg-bg-1/80"
    ></div>
    <!-- Modal -->
    <div
      v-bind="$attrs"
      class="relative scrollbar-mini max-h-full w-full min-w-[320px]
        overflow-auto border-border-1 bg-bg-2 shadow-shadow-2 max-sm:max-w-none
        sm:rounded-normal sm:border sm:shadow-xl"
    >
      <header
        class="sticky top-0 z-10 border-b border-border-1 bg-bg-2/30
          backdrop-blur-md"
      >
        <slot name="header"></slot>
      </header>
      <main>
        <slot></slot>
      </main>
    </div>
  </section>
</template>
