<script lang="ts" setup>
const { width = 'wide', p = true } = defineProps<{
  p?: boolean;
  width?: 'wide' | 'narrow';
}>();

const classes = computed(() => {
  const classArr: string[] = [];

  switch (width) {
    case 'narrow':
      classArr.push('w-[min(700px,100%)]');
      break;
    case 'wide':
    default:
      classArr.push('w-[min(1100px,100%)]');
      break;
  }

  if (p) {
    classArr.push('sm:px-4');
  }

  return classArr.join(' ');
});
</script>

<template>
  <div class="m-auto" :class="classes">
    <slot></slot>
  </div>
</template>
