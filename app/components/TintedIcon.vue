<script lang="ts" setup>
import { stringColorHue } from '#layers/thei/shared/utils/string-color';

const props = defineProps<{
  svg: string;
  seed: string;
}>();

const hue = computed(() => stringColorHue(props.seed));
const color = computed(
  () =>
    `light-dark(oklch(52% 0.18 ${hue.value}deg), oklch(64% 0.14 ${hue.value}deg))`,
);

const uid = useId();
const processedSvg = computed(() => {
  const ids = [...props.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
  if (!ids.length) return props.svg;
  let result = props.svg;
  for (const id of ids) {
    const scoped = `${uid}-${id}`;
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result
      .replace(new RegExp(`\\bid="${esc}"`, 'g'), `id="${scoped}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${scoped})`)
      .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${scoped}"`)
      .replace(
        new RegExp(`xlink:href="#${esc}"`, 'g'),
        `xlink:href="#${scoped}"`,
      );
  }
  return result;
});
</script>

<template>
  <div
    class="flex items-center justify-center overflow-hidden"
    :style="{ color }"
  >
    <div class="h-full w-full" v-html="processedSvg" />
  </div>
</template>
