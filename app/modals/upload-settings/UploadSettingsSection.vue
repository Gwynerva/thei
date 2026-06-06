<script lang="ts" setup>
const props = defineProps<{
  active: boolean;
  title: string;
}>();

const emit = defineEmits<{
  activate: [];
}>();

const isActive = computed({
  get: () => props.active,
  set: (value: boolean) => {
    if (value) emit('activate');
  },
});
</script>

<template>
  <section class="flex flex-col gap-sm p-sm">
    <div class="flex items-center justify-between gap-sm">
      <button
        type="button"
        class="cursor-pointer text-left font-semibold tracking-tight
          transition-colors"
        :class="active ? 'text-accent' : 'text-text-1'"
        @click="emit('activate')"
      >
        {{ title }}
      </button>
      <div class="flex items-center gap-sm">
        <slot name="header-extra"></slot>
        <FieldToggle v-model="isActive" />
      </div>
    </div>

    <div
      class="grid overflow-hidden transition-[grid-template-rows,opacity]"
      :aria-hidden="!active"
      :inert="!active"
      :class="
        active ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      "
    >
      <div class="min-h-0 overflow-hidden">
        <div class="flex flex-col gap-sm">
          <slot></slot>
        </div>
      </div>
    </div>
  </section>
</template>
