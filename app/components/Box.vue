<template>
  <section
    v-if="$slots.default"
    class="relative rounded-normal border border-border-1 bg-bg-2 shadow-md
      shadow-shadow-1"
  >
    <slot></slot>
  </section>
</template>
