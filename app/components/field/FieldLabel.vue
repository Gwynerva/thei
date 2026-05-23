<script lang="ts" setup>
const props = defineProps<{
  required?: boolean;
  onActivate?: (element: HTMLElement) => void;
}>();

const root = useTemplateRef('root');

function handleClick() {
  const target = root.value
    ?.closest('[data-field]')
    ?.querySelector<HTMLElement>('[data-label-focus]');

  if (!target) {
    return;
  }

  if (props.onActivate) {
    props.onActivate(target);
  } else {
    target.focus();
  }
}
</script>

<template>
  <div
    ref="root"
    class="cursor-pointer font-semibold tracking-tight"
    @click="handleClick"
  >
    <slot></slot
    ><span
      v-if="required"
      class="relative -top-1 -right-1.5 text-xs text-accent"
      >*</span
    >
  </div>
</template>
