<script lang="ts" setup>
defineProps<{ focus?: HTMLElement }>();
</script>

<template>
  <div class="font-semibold tracking-tight" @click="focus?.focus()">
    <slot></slot>
  </div>
</template>
