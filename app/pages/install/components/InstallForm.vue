<script lang="ts" setup>
useHead({
  title: computed(() => phrase.value.install_thei),
});
</script>

<template>
  <Container width="narrow">
    <div class="flex flex-col gap-lg">
      <SettingsGlobals />
      <SettingsVisuals />
      <SettingsAdmin />
    </div>

    <Box>
      <div class="flex flex-wrap gap-3">
        <div
          v-for="_class of [
            'bg-accent',
            'bg-bg-1',
            'bg-bg-2',
            'bg-bg-3',
            'bg-bg-4',
            'bg-bg-accent',
            'bg-border-1',
            'bg-border-2',
            'bg-border-3',
            'bg-shadow-1',
            'bg-shadow-2',
            'bg-shadow-3',
            'bg-text-1',
            'bg-text-2',
            'bg-text-3',
          ]"
          class="flex size-[64px] shrink-0 items-center justify-center
            rounded-full border-2 border-bw-reverse/50 text-xs"
          :class="_class"
        >
          {{ _class.replace('bg-', '') }}
        </div>
      </div>
    </Box>
  </Container>
</template>
