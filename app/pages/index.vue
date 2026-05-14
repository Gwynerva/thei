<script lang="ts" setup>
definePageMeta({
  layout: 'public',
});

const { cycleTheme, binaryTheme } = useTheme();

function click() {
  cycleTheme();
}
</script>

<template>
  <h1 class="text-4xl font-bold text-amber-700">Hello, My Dear!</h1>
  <p>I waited you!</p>
  <button @click="click">Cycle theme</button>
  <TheiLink to="/test">To Test</TheiLink>
</template>
