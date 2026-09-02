<script lang="ts" setup>
defineProps<{
  label: string;
  value: string;
  to: string;
  valueWidth: 'day' | 'month' | 'year';
}>();
</script>

<template>
  <TheiLink
    :to="to"
    class="group flex min-w-0 items-center justify-center gap-2 py-xs text-sm
      transition hocus:text-accent"
  >
    <span
      class="shrink-0 text-xs font-semibold tracking-wide text-text-3 uppercase
        transition group-hocus:text-accent"
    >
      {{ label }}
    </span>
    <span
      class="grid shrink-0 rounded-sm bg-bg-3 px-xs py-1 text-center
        font-semibold text-text-2 transition group-hocus:bg-accent/15
        group-hocus:text-accent"
      :class="{
        'w-10': valueWidth === 'day',
        'w-24': valueWidth === 'month',
        'w-16': valueWidth === 'year',
      }"
    >
      <Transition
        enter-from-class="translate-y-1 opacity-0"
        enter-active-class="transition duration-200 motion-reduce:duration-0"
        leave-to-class="-translate-y-1 opacity-0"
        leave-active-class="transition duration-150 motion-reduce:duration-0"
      >
        <span
          :key="value"
          class="col-start-1 row-start-1 block truncate capitalize"
        >
          {{ value }}
        </span>
      </Transition>
    </span>
  </TheiLink>
</template>
