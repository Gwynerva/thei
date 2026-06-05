<script lang="ts" setup>
const { size, name, extension } = defineProps<{
  name?: string;
  extension?: string;
  size?: number;
  dimensions?: { width: number; height: number };
}>();

const humanSize = useHumanSize();
const formattedSize = computed(() =>
  size !== undefined ? humanSize(size) : undefined,
);

const baseName = computed(() => {
  if (!name || !extension) return name;
  const suffix = '.' + extension;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
});
</script>

<template>
  <div class="flex flex-col text-sm tracking-tight text-text-2">
    <div v-if="baseName !== undefined" class="flex justify-between gap-sm">
      <div class="shrink-0">Name</div>
      <div class="truncate text-right font-semibold">{{ baseName }}</div>
    </div>
    <div class="flex justify-between gap-sm">
      <div class="shrink-0">Extension</div>
      <div class="font-semibold">
        <template v-if="extension">{{ extension }}</template>
        <em v-else class="opacity-50">empty</em>
      </div>
    </div>
    <div v-if="formattedSize !== undefined" class="flex justify-between gap-sm">
      <div class="shrink-0">Size</div>
      <div class="font-semibold">{{ formattedSize }}</div>
    </div>
    <div v-if="dimensions" class="flex justify-between gap-sm">
      <div class="shrink-0">Dimensions</div>
      <div class="font-semibold">
        {{ dimensions.width }} × {{ dimensions.height }}
      </div>
    </div>
  </div>
</template>
