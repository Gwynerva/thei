<script lang="ts" setup>
import { visualsThemes } from '../scripts/visuals';

definePageMeta({
  layout: 'public',
});

const visuals = useVisuals();

function cycleTheme() {
  const currentTheme = visuals.value.theme;
  const themes = visualsThemes;
  const currentIndex = themes.indexOf(currentTheme);
  const nextIndex = (currentIndex + 1) % themes.length;
  visuals.value.theme = themes[nextIndex]!;
}

function click() {
  cycleTheme();
}
</script>

<template>
  <h1 class="text-amber-700 text-4xl font-bold">Hello, My Dear!</h1>
  <p>I waited you!</p>
  <button @click="click">Cycle theme</button>
  <TheiLink to="/test">To Test</TheiLink>
</template>
