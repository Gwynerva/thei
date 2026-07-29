<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition-opacity motion-reduce:duration-0"
    leave-to-class="opacity-0"
    leave-active-class="transition-opacity motion-reduce:duration-0"
  >
    <slot></slot>
  </Transition>
</template>
