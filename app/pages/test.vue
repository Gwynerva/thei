<script lang="ts" setup>
definePageMeta({
  layout: 'public',
});

function click() {
  const { cycleTheme } = useTheme();
  cycleTheme();
}
</script>

<template>
  <h1 class="text-4xl font-bold text-amber-700">Test</h1>
  <p>I waited you!</p>
  <button @click="click">Cycle theme</button>
</template>
