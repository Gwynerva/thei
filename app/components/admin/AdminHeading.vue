<script lang="ts" setup>
const { level } = defineProps<{
  level: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
}>();

const levelClasses = {
  1: 'font-bold text-3xl my-8',
  2: 'font-bold text-2xl my-5',
  3: 'font-bold text-xl my-4',
  4: 'font-bold text-lg my-3',
  5: 'font-bold text-base my-2',
  6: 'font-bold text-sm my-1',
};

const HeadingTag = computed(() => h(`h${level}`));
</script>

<template>
  <section class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <component
        :is="HeadingTag"
        :class="levelClasses[level]"
        class="text-main-300"
      >
        {{ title }}
      </component>
      <slot name="after"></slot>
    </div>
    <slot name="opposite"></slot>
  </section>
</template>
